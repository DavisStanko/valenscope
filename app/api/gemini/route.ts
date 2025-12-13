import { NextRequest, NextResponse } from "next/server";

import {
  getAdminAuth,
  getAdminDb,
  hasAdminCredentials,
} from "@/lib/firebase/admin";

export const runtime = "nodejs";

const DAILY_LIMIT = 5;
const COOLDOWN_SECONDS = 5;
const MAX_PROMPT_CHARS = 3500;
const MODEL_NAME = "gemini-2.5-flash-lite";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

type RateLimitRecord = {
  requestsToday: number;
  lastRequestDate: string | null;
  lastRequestTime: string | null;
};

type GenerationConfig = {
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
};

function dateKey() {
  return new Date().toISOString().split("T")[0];
}

function getBearerToken(req: NextRequest) {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!scheme || !token) return null;
  return scheme.toLowerCase() === "bearer" ? token : null;
}

function sanitizeGenerationConfig(
  input: GenerationConfig = {}
): GenerationConfig {
  const clamp = (
    value: unknown,
    min: number,
    max: number,
    fallback: number
  ) => {
    if (typeof value !== "number" || Number.isNaN(value)) return fallback;
    return Math.min(Math.max(value, min), max);
  };

  return {
    temperature: clamp(input.temperature, 0, 2, 0.7),
    maxOutputTokens: clamp(input.maxOutputTokens, 64, 1024, 256),
    topP: clamp(input.topP, 0, 1, 0.8),
    topK: clamp(input.topK, 1, 64, 40),
  };
}

async function getRateLimitRecord(userId: string): Promise<RateLimitRecord> {
  const db = getAdminDb();
  const ref = db.ref(`users/${userId}/ai_rate_limit`);
  const snapshot = await ref.get();

  if (snapshot.exists()) {
    const value = snapshot.val();
    return {
      requestsToday: value.requestsToday ?? 0,
      lastRequestDate: value.lastRequestDate ?? null,
      lastRequestTime: value.lastRequestTime ?? null,
    };
  }

  return {
    requestsToday: 0,
    lastRequestDate: null,
    lastRequestTime: null,
  };
}

async function saveRateLimitRecord(userId: string, record: RateLimitRecord) {
  const db = getAdminDb();
  const ref = db.ref(`users/${userId}/ai_rate_limit`);
  await ref.set(record);
}

function applyRateLimit(record: RateLimitRecord) {
  const today = dateKey();
  const requestsToday =
    record.lastRequestDate === today ? record.requestsToday || 0 : 0;

  if (requestsToday >= DAILY_LIMIT) {
    return {
      allowed: false,
      reason: "daily_limit" as const,
      remaining: 0,
      cooldownRemaining: 0,
      record: {
        ...record,
        requestsToday,
        lastRequestDate: today,
      },
    };
  }

  if (record.lastRequestTime) {
    const last = Date.parse(record.lastRequestTime);
    if (!Number.isNaN(last)) {
      const secondsSince = (Date.now() - last) / 1000;
      if (secondsSince < COOLDOWN_SECONDS) {
        return {
          allowed: false,
          reason: "cooldown" as const,
          remaining: Math.max(0, DAILY_LIMIT - requestsToday),
          cooldownRemaining: Math.ceil(COOLDOWN_SECONDS - secondsSince),
          record: {
            ...record,
            requestsToday,
            lastRequestDate: today,
          },
        };
      }
    }
  }

  return {
    allowed: true,
    remaining: Math.max(0, DAILY_LIMIT - requestsToday),
    record: {
      ...record,
      requestsToday,
      lastRequestDate: today,
    },
  };
}

async function callGeminiAPI(
  prompt: string,
  generationConfig?: GenerationConfig
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server");
  }

  const url = `${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: sanitizeGenerationConfig(generationConfig),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error?.message || "Gemini request failed";
    const status = response.status || 502;
    throw new Error(`${message} (status ${status})`);
  }

  const text =
    payload?.candidates?.[0]?.content?.parts
      ?.map((part: any) => part?.text)
      .filter(Boolean)
      .join("\n") ||
    payload?.text ||
    "";

  if (!text) {
    throw new Error("Gemini returned no content");
  }

  return text.trim();
}

export async function POST(req: NextRequest) {
  if (!hasAdminCredentials()) {
    return NextResponse.json(
      { error: "Server missing Firebase Admin credentials." },
      { status: 500 }
    );
  }

  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(token, true);
  } catch (error) {
    console.error("ID token verification failed", error);
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  if (!decoded?.uid) {
    return NextResponse.json(
      { error: "Invalid token payload" },
      { status: 401 }
    );
  }

  if (!decoded.email_verified) {
    return NextResponse.json(
      { error: "Email verification required", code: "email_not_verified" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const prompt = body?.prompt;
  const generationConfig = body?.generationConfig as
    | GenerationConfig
    | undefined;

  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const trimmedPrompt = prompt.trim().slice(0, MAX_PROMPT_CHARS);
  if (!trimmedPrompt) {
    return NextResponse.json(
      { error: "Prompt cannot be empty" },
      { status: 400 }
    );
  }

  let record = await getRateLimitRecord(decoded.uid);
  const limit = applyRateLimit(record);

  if (!limit.allowed) {
    return NextResponse.json(
      {
        error:
          limit.reason === "daily_limit"
            ? "Daily AI limit reached. Try again tomorrow."
            : `Please wait ${limit.cooldownRemaining}s before requesting again.`,
        code: limit.reason,
        remaining: limit.remaining,
        cooldownRemaining: limit.cooldownRemaining,
        rateLimit: limit.record,
      },
      { status: 429 }
    );
  }

  try {
    const text = await callGeminiAPI(trimmedPrompt, generationConfig);

    const updatedRecord: RateLimitRecord = {
      requestsToday: (limit.record.requestsToday || 0) + 1,
      lastRequestDate: dateKey(),
      lastRequestTime: new Date().toISOString(),
    };

    await saveRateLimitRecord(decoded.uid, updatedRecord);

    return NextResponse.json({ text, rateLimit: updatedRecord });
  } catch (error: any) {
    console.error("Gemini API error", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate insights" },
      { status: 502 }
    );
  }
}
