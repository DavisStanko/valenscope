// @ts-nocheck
"use client";

import { auth } from "@/lib/firebase/auth";
import {
  getFirebaseAIRateLimitData,
  saveFirebaseAIRateLimitData,
} from "@/lib/firebase/database";
import { showToast } from "@/lib/ui/toast";

const API_URL = "/api/gemini";

export const AI_CONFIG = {
  COOLDOWN_SECONDS: 5,
  DAILY_LIMIT: 5,
  API_URL,
  TOP_N_PER_CATEGORY: 5,
  MAX_PROMPT_CHARS: 3500,
};

type AiInsightsState = {
  isLoading: boolean;
  cooldownEndTime: number | null;
  cooldownInterval: ReturnType<typeof setInterval> | null;
  lastInsights: string | null;
  lastGeneratedAt: string | null;
};

export let aiInsightsState: AiInsightsState = {
  isLoading: false,
  cooldownEndTime: null,
  cooldownInterval: null,
  lastInsights: null,
  lastGeneratedAt: null,
};

export function clearAIInsightsState() {
  aiInsightsState.lastInsights = null;
  aiInsightsState.lastGeneratedAt = null;
  aiInsightsState.isLoading = false;
  if (aiInsightsState.cooldownInterval) {
    clearInterval(aiInsightsState.cooldownInterval);
    aiInsightsState.cooldownInterval = null;
  }
  aiInsightsState.cooldownEndTime = null;
}

function getUTCDateString() {
  return new Date().toISOString().split("T")[0];
}

async function getAIRateLimitData(userId) {
  const defaultData = {
    requestsToday: 0,
    lastRequestDate: null,
    lastRequestTime: null,
  };

  if (userId) {
    const data = await getFirebaseAIRateLimitData(userId);
    if (data) {
      return { ...defaultData, ...data };
    }
  } else {
    try {
      const stored = localStorage.getItem("valenscope_ai_ratelimit");
      if (stored) {
        return { ...defaultData, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error("Error loading AI rate limit from localStorage:", error);
    }
  }

  return defaultData;
}

async function saveAIRateLimitData(userId, data) {
  if (userId) {
    await saveFirebaseAIRateLimitData(userId, data);
  } else {
    try {
      localStorage.setItem("valenscope_ai_ratelimit", JSON.stringify(data));
    } catch (error) {
      console.error("Error saving AI rate limit to localStorage:", error);
    }
  }
}

export async function canMakeAIRequest(userId) {
  const rateLimitData = await getAIRateLimitData(userId);
  const today = getUTCDateString();

  if (rateLimitData.lastRequestDate !== today) {
    return { allowed: true, remaining: AI_CONFIG.DAILY_LIMIT };
  }

  if (rateLimitData.requestsToday >= AI_CONFIG.DAILY_LIMIT) {
    return { allowed: false, remaining: 0, reason: "daily_limit" };
  }

  if (rateLimitData.lastRequestTime) {
    const lastRequest = new Date(rateLimitData.lastRequestTime);
    const now = new Date();
    const secondsSinceLastRequest = (now - lastRequest) / 1000;

    if (secondsSinceLastRequest < AI_CONFIG.COOLDOWN_SECONDS) {
      const remainingCooldown = Math.ceil(
        AI_CONFIG.COOLDOWN_SECONDS - secondsSinceLastRequest
      );
      return {
        allowed: false,
        remaining: AI_CONFIG.DAILY_LIMIT - rateLimitData.requestsToday,
        reason: "cooldown",
        cooldownRemaining: remainingCooldown,
      };
    }
  }

  return {
    allowed: true,
    remaining: AI_CONFIG.DAILY_LIMIT - rateLimitData.requestsToday,
  };
}

async function persistRateLimitSnapshot(userId, data) {
  if (!data) return;
  if (!userId) return;

  const snapshot = {
    lastRequestDate: data.lastRequestDate || getUTCDateString(),
    lastRequestTime: data.lastRequestTime || new Date().toISOString(),
    requestsToday: data.requestsToday ?? 0,
  };

  await saveAIRateLimitData(userId, snapshot);
}

export function buildGeminiPrompt(currentData) {
  const assets = currentData.assets || [];
  const debts = currentData.debts || [];
  const income = currentData.income || [];
  const expenses = currentData.expenses || [];
  const retirementYears = currentData.retirementYears || 0;

  const totalAssets = assets.reduce(
    (sum, item) => sum + (parseFloat(item.value) || 0),
    0
  );
  const totalDebts = debts.reduce(
    (sum, item) => sum + (parseFloat(item.value) || 0),
    0
  );
  const totalExpenses = expenses.reduce(
    (sum, item) => sum + (parseFloat(item.amount) || 0),
    0
  );

  const liquidAssets = assets
    .filter(
      (a) =>
        (a.name || "").toLowerCase().includes("saving") ||
        (a.name || "").toLowerCase().includes("cash") ||
        (a.name || "").toLowerCase().includes("checking") ||
        (a.name || "").toLowerCase().includes("emergency")
    )
    .reduce((sum, a) => sum + (parseFloat(a.value) || 0), 0);
  const emergencyMonths = totalExpenses > 0 ? liquidAssets / totalExpenses : 0;

  const fmt = (v) =>
    `$${(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const N = AI_CONFIG.TOP_N_PER_CATEGORY || 5;

  const topAssets = (assets || []).slice(0, N).map((a) => {
    return `- ${a.name || "Untitled"}: ${fmt(
      parseFloat(a.value) || 0
    )} (ROI: ${((parseFloat(a.roi) || 0) * 100).toFixed(2)}%)`;
  });

  const topDebts = (debts || []).slice(0, N).map((d) => {
    return `- ${d.name || "Untitled"}: ${fmt(
      parseFloat(d.value) || 0
    )} (APR: ${((parseFloat(d.apr) || 0) * 100).toFixed(2)}%)`;
  });

  const getIncomeBehavior = (it) => {
    if (it.retirementBehavior !== undefined && it.retirementBehavior !== null)
      return it.retirementBehavior;
    if (it.continueAfterRetirement) return "continues";
    return "stops";
  };

  const currentIncome = (income || []).reduce((sum, it) => {
    const behavior = getIncomeBehavior(it);
    if (behavior === "starts") return sum;
    return sum + (parseFloat(it.amount) || 0);
  }, 0);

  const topIncome = (income || []).slice(0, N).map((i) => {
    const behavior = getIncomeBehavior(i);
    const behaviorLabel =
      behavior === "continues"
        ? "Continues after retirement (active now)"
        : behavior === "stops"
        ? "Stops after retirement (active now)"
        : "Starts at retirement (inactive now)";
    return `- ${i.name || "Untitled"}: ${fmt(
      parseFloat(i.amount) || 0
    )} (${behaviorLabel})`;
  });

  const topExpenses = (expenses || [])
    .slice(0, N)
    .map((e) => `- ${e.name || "Untitled"}: ${fmt(parseFloat(e.amount) || 0)}`);

  const profile = currentData.profile || {};
  const age = profile.age || null;
  const retirementYearExplicit = profile.retirementYear || null;
  const retirementYear = retirementYearExplicit
    ? retirementYearExplicit
    : retirementYears > 0
    ? new Date().getFullYear() + retirementYears
    : null;

  const totalIncomeShown = currentIncome;
  const netCashFlowShown = totalIncomeShown - totalExpenses;

  const debtLines = (topDebts.length ? topDebts : ["- (none)"]).map((line) => {
    const aprMatch = line.match(/APR: ([\d\.]+)%\)?$/);
    const apr = aprMatch ? parseFloat(aprMatch[1]) / 100 : 0;
    if (apr >= 0.2) return `${line} (HIGH PRIORITY)`;
    return line;
  });

  let prompt = `You are a friendly financial advisor providing brief insights for a Valenscope user.

USER PROFILE:`;

  if (age !== null) prompt += `\n- Age: ${age}`;
  if (retirementYear)
    prompt += `\n- Retirement Year: ${retirementYear} (in ${retirementYears} years)`;

  prompt += `\n\nMONTHLY CASH FLOW:\n- Total Income: ${fmt(
    totalIncomeShown
  )}\n- Total Expenses: ${fmt(totalExpenses)}\n- Net Cash Flow: ${
    netCashFlowShown >= 0 ? "+" : "-"
  }${fmt(Math.abs(netCashFlowShown))}\n\n`;

  prompt += `TOP INCOME SOURCES:\n${
    topIncome.length ? topIncome.join("\n") : "- (none)"
  }\n\n`;

  prompt += `TOP EXPENSES:\n${
    topExpenses.length ? topExpenses.join("\n") : "- (none)"
  }\n\n`;

  prompt += `ASSETS:\n- Total: ${fmt(
    totalAssets
  )}\n- Emergency Fund: ~${emergencyMonths.toFixed(
    1
  )} months of expenses\n- Top Holdings:\n${
    topAssets.length ? topAssets.join("\n") : "- (none)"
  }\n\n`;

  prompt += `DEBTS:\n- Total: ${fmt(totalDebts)}\n${debtLines.join("\n")}\n\n`;

  prompt += `Provide 2-3 brief, actionable financial insights in under 150 words. Be encouraging but realistic. Focus on:\n1. Immediate priorities (high-interest debt, emergency fund)\n2. Cash flow optimization\n3. Retirement readiness\n\nUse a warm, supportive tone.`;

  return prompt;
}

async function callGeminiAPI(prompt, idToken, generationConfig) {
  const headers = {
    "Content-Type": "application/json",
  } as Record<string, string>;

  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  const response = await fetch(AI_CONFIG.API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      prompt,
      generationConfig: {
        temperature: generationConfig?.temperature ?? 0.7,
        maxOutputTokens: generationConfig?.maxOutputTokens ?? 256,
        topP: generationConfig?.topP ?? 0.8,
        topK: generationConfig?.topK ?? 40,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message =
      errorData?.error ||
      errorData?.error?.message ||
      `API request failed with status ${response.status}`;

    const error = new Error(message);
    error.code = errorData?.code;
    error.rateLimit = errorData?.rateLimit;
    error.remaining = errorData?.remaining;
    error.cooldownRemaining = errorData?.cooldownRemaining;
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  if (data.text) return data;
  if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
    return { text: data.candidates[0].content.parts[0].text };
  }

  throw new Error("Unexpected API response format");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "An unknown error occurred.";
}

function formatAIResponse(text) {
  let html = text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^[\-\•]\s*/gm, "• ")
    .replace(/^\d+\.\s+/gm, (match) => match)
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      if (line.trim().startsWith("•")) {
        return `<li>${line.trim().substring(1).trim()}</li>`;
      }
      return `<p>${line}</p>`;
    })
    .join("");

  html = html.replace(
    /(<li>.*?<\/li>)+/g,
    (match) => `<ul class="list-disc list-inside space-y-1">${match}</ul>`
  );

  return html;
}

export function updateAIInsightsUI(userId) {
  const section = document.getElementById("ai-insights-section");
  const generateBtn = document.getElementById("generate-insights-btn");
  const btnText = document.getElementById("insights-btn-text");
  const iconSparkle = document.getElementById("insights-icon-sparkle");
  const iconLoading = document.getElementById("insights-icon-loading");
  const cooldownBar = document.getElementById("ai-cooldown-bar");
  const cooldownText = document.getElementById("ai-cooldown-text");
  const cooldownProgress = document.getElementById("ai-cooldown-progress");
  const limitReached = document.getElementById("ai-limit-reached");
  const signinRequired = document.getElementById("ai-signin-required");
  const verifyRequired = document.getElementById("ai-verify-required");
  const insightsContent = document.getElementById("ai-insights-content");
  const insightsText = document.getElementById("ai-insights-text");
  const insightsTimestamp = document.getElementById("ai-insights-timestamp");
  const insightsEmpty = document.getElementById("ai-insights-empty");
  const insightsError = document.getElementById("ai-insights-error");
  const dailyLimit = document.getElementById("ai-daily-limit");
  const requestsRemaining = document.getElementById("ai-requests-remaining");

  if (!section) return;

  if (!userId) {
    if (generateBtn) generateBtn.disabled = true;
    if (signinRequired) signinRequired.classList.remove("hidden");
    if (insightsContent) insightsContent.classList.add("hidden");
    if (insightsEmpty) insightsEmpty.classList.add("hidden");
    if (insightsError) insightsError.classList.add("hidden");
    if (cooldownBar) cooldownBar.classList.add("hidden");
    if (limitReached) limitReached.classList.add("hidden");
    if (dailyLimit) dailyLimit.classList.add("hidden");
    return;
  }

  const currentUser = auth.currentUser;
  if (currentUser && !currentUser.emailVerified) {
    if (generateBtn) generateBtn.disabled = true;
    if (signinRequired) signinRequired.classList.add("hidden");
    if (verifyRequired) verifyRequired.classList.remove("hidden");
    if (insightsContent) insightsContent.classList.add("hidden");
    if (insightsEmpty) insightsEmpty.classList.add("hidden");
    if (insightsError) insightsError.classList.add("hidden");
    if (cooldownBar) cooldownBar.classList.add("hidden");
    if (limitReached) limitReached.classList.add("hidden");
    if (dailyLimit) dailyLimit.classList.add("hidden");
    return;
  }

  if (verifyRequired) verifyRequired.classList.add("hidden");
  if (signinRequired) signinRequired.classList.add("hidden");

  if (aiInsightsState.isLoading) {
    if (generateBtn) generateBtn.disabled = true;
    if (btnText) btnText.textContent = "Generating...";
    if (iconSparkle) iconSparkle.classList.add("hidden");
    if (iconLoading) iconLoading.classList.remove("hidden");
  } else {
    if (iconSparkle) iconSparkle.classList.remove("hidden");
    if (iconLoading) iconLoading.classList.add("hidden");
    if (btnText) btnText.textContent = "Generate Insights";
  }

  if (aiInsightsState.lastInsights) {
    if (insightsContent) insightsContent.classList.remove("hidden");
    if (insightsEmpty) insightsEmpty.classList.add("hidden");
    if (insightsError) insightsError.classList.add("hidden");
    if (insightsText)
      insightsText.innerHTML = formatAIResponse(aiInsightsState.lastInsights);
    if (insightsTimestamp && aiInsightsState.lastGeneratedAt) {
      insightsTimestamp.textContent = new Date(
        aiInsightsState.lastGeneratedAt
      ).toLocaleString();
    }
  } else if (!aiInsightsState.isLoading) {
    if (insightsContent) insightsContent.classList.add("hidden");
    if (insightsEmpty) insightsEmpty.classList.remove("hidden");
    if (insightsError) insightsError.classList.add("hidden");
  }

  getAIRateLimitData(userId).then((rateLimitData) => {
    const today = getUTCDateString();
    let used = 0;
    if (rateLimitData.lastRequestDate === today) {
      used = Math.max(0, rateLimitData.requestsToday || 0);
    }

    const remaining = Math.max(0, AI_CONFIG.DAILY_LIMIT - used);

    if (requestsRemaining) requestsRemaining.textContent = `${remaining}`;
    const dailyLimitValueEl = document.getElementById("ai-daily-limit-value");
    if (dailyLimitValueEl) {
      dailyLimitValueEl.textContent = AI_CONFIG.DAILY_LIMIT;
    }
    if (dailyLimit) dailyLimit.classList.remove("hidden");

    if (remaining === 0) {
      if (generateBtn) generateBtn.disabled = true;
      if (limitReached) limitReached.classList.remove("hidden");
      const now = new Date();
      const tomorrow = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
      );
      const hoursLeft = Math.ceil((tomorrow - now) / (1000 * 60 * 60));
      const resetTimeEl = document.getElementById("ai-reset-time");
      if (resetTimeEl) {
        resetTimeEl.textContent = `(~${hoursLeft} hours)`;
      }
    } else {
      if (limitReached) limitReached.classList.add("hidden");
      if (
        !aiInsightsState.isLoading &&
        !aiInsightsState.cooldownEndTime &&
        generateBtn
      ) {
        generateBtn.disabled = false;
      }
    }
  });
}

function startCooldown(userId) {
  const cooldownBar = document.getElementById("ai-cooldown-bar");
  const cooldownText = document.getElementById("ai-cooldown-text");
  const cooldownProgress = document.getElementById("ai-cooldown-progress");
  const generateBtn = document.getElementById("generate-insights-btn");

  if (!cooldownBar) return;

  aiInsightsState.cooldownEndTime =
    Date.now() + AI_CONFIG.COOLDOWN_SECONDS * 1000;
  cooldownBar.classList.remove("hidden");
  if (generateBtn) generateBtn.disabled = true;

  const updateCooldown = () => {
    const now = Date.now();
    const remaining = Math.max(0, aiInsightsState.cooldownEndTime - now);
    const secondsLeft = Math.ceil(remaining / 1000);
    const progressPercent =
      (remaining / (AI_CONFIG.COOLDOWN_SECONDS * 1000)) * 100;

    if (cooldownText) cooldownText.textContent = `${secondsLeft}s`;
    if (cooldownProgress) cooldownProgress.style.width = `${progressPercent}%`;

    if (remaining <= 0) {
      clearInterval(aiInsightsState.cooldownInterval);
      aiInsightsState.cooldownInterval = null;
      aiInsightsState.cooldownEndTime = null;
      cooldownBar.classList.add("hidden");
      updateAIInsightsUI(userId);
    }
  };

  updateCooldown();
  aiInsightsState.cooldownInterval = setInterval(updateCooldown, 100);
}

function showAIError(message) {
  const insightsContent = document.getElementById("ai-insights-content");
  const insightsEmpty = document.getElementById("ai-insights-empty");
  const insightsError = document.getElementById("ai-insights-error");
  const errorMessage = document.getElementById("ai-error-message");

  if (insightsContent) insightsContent.classList.add("hidden");
  if (insightsEmpty) insightsEmpty.classList.add("hidden");
  if (insightsError) insightsError.classList.remove("hidden");
  if (errorMessage) errorMessage.textContent = message;
}

export async function generateAIInsights(userId, currentData) {
  const user = auth.currentUser;
  if (!user) {
    showToast("Please sign in to use AI Insights", "warning");
    return;
  }

  if (!user.emailVerified) {
    showToast("Please verify your email to use AI Insights", "warning");
    return;
  }

  if (aiInsightsState.isLoading) return;

  const canRequest = await canMakeAIRequest(userId);
  if (!canRequest.allowed) {
    if (canRequest.reason === "daily_limit") {
      showToast("Daily limit reached. Try again tomorrow!", "warning");
    } else if (canRequest.reason === "cooldown") {
      showToast(
        `Please wait ${canRequest.cooldownRemaining}s before requesting again`,
        "info"
      );
    }
    updateAIInsightsUI(userId);
    return;
  }

  aiInsightsState.isLoading = true;
  updateAIInsightsUI(userId);

  try {
    const prompt = buildGeminiPrompt(currentData);
    const idToken = await user.getIdToken();
    const response = await callGeminiAPI(prompt, idToken, {
      temperature: 0.7,
      maxOutputTokens: 256,
      topP: 0.8,
      topK: 40,
    });

    if (response?.rateLimit) {
      await persistRateLimitSnapshot(userId, response.rateLimit);
    }

    aiInsightsState.lastInsights = response?.text || "";
    aiInsightsState.lastGeneratedAt = new Date().toISOString();
    aiInsightsState.isLoading = false;

    startCooldown(userId);
    updateAIInsightsUI(userId);

    showToast("Insights generated successfully!", "success");
  } catch (error) {
    console.error("Error generating AI insights:", error);
    if (error?.rateLimit && userId) {
      await persistRateLimitSnapshot(userId, error.rateLimit);
    }

    aiInsightsState.isLoading = false;
    updateAIInsightsUI(userId);

    const message = getErrorMessage(error);
    const fallbackMessage =
      error?.code === "daily_limit"
        ? "Daily limit reached. Try again tomorrow."
        : error?.code === "cooldown"
        ? `Please wait ${
            error.cooldownRemaining || "a few"
          }s before requesting again.`
        : "Failed to generate insights. Please try again.";

    showAIError(message || fallbackMessage);
    showToast(
      message || fallbackMessage,
      error?.status === 429 ? "warning" : "error"
    );
  }
}

export function initializeAIInsights(getUserId, getCurrentData) {
  const generateBtn = document.getElementById("generate-insights-btn");
  if (generateBtn && !generateBtn.dataset.bound) {
    generateBtn.addEventListener("click", () => {
      const userId = getUserId();
      const currentData = getCurrentData();
      generateAIInsights(userId, currentData);
    });
    generateBtn.dataset.bound = "true";
  }

  updateAIInsightsUI(getUserId());
}
