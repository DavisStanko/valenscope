// @ts-nocheck
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ThemeProvider } from "next-themes";
import ThemeToggle from "./components/ThemeToggle";
import CalculationFormulas from "./components/CalculationFormulas";

import { formatCurrency, parseNumberSafe, handleEnterKey, limitInputLength, MAX_INPUT_LENGTHS, selectAllTextForEditable } from "@/lib/core/utils";
import { calculateProjection, simulateMonthByMonth } from "@/lib/core/simulation";
import { updateChart, destroyChart, applyLegendVisibility, updateChartTheme } from "@/lib/ui/charts";
import { renderTable, addItem, deleteItem as deleteTableItem } from "@/lib/ui/tables";
import { showToast } from "@/lib/ui/toast";
import { showAuthModal, hideAuthModal, showResetModal, hideResetModal, updateUIForAuthState, updateUserDisplay } from "@/lib/ui/modals";
import { renderSurplusAllocations, renderDeficitAllocations, updateSurplusTotalStatus } from "@/lib/features/allocations";
import { initializeAIInsights, updateAIInsightsUI, clearAIInsightsState } from "@/lib/features/ai-insights";
import { showEmailVerificationBanner, hideEmailVerificationBanner, resendVerificationEmail, initializeVisibilityListener, setOnVerified } from "@/lib/features/verification";
import { loadFromLocalStorage, saveToLocalStorage, LOCAL_STORAGE_KEY } from "@/lib/storage/local-storage";
import { auth, onAuthStateChanged, signInWithGoogle, signInWithEmail, signUpWithEmail, handleSignOut, handleForgotPassword } from "@/lib/firebase/auth";
import { loadDataAndStartListener, updateFirebaseData, saveCompleteData } from "@/lib/firebase/database";

// Helper function to generate fresh UUIDs for default data
function createDefaultData() {
  return {
    assets: [
      {
        id: crypto.randomUUID(),
        name: "Stock Portfolio",
        value: 0.0,
        roi: 0.07,
      },
      {
        id: crypto.randomUUID(),
        name: "Savings Account",
        value: 2000.0,
        roi: 0.01,
      },
    ],
    debts: [
      {
        id: crypto.randomUUID(),
        name: "Credit Card",
        value: 2000.0,
        apr: 0.22,
      },
      {
        id: crypto.randomUUID(),
        name: "Car Loan",
        value: 40000.0,
        apr: 0.07,
      },
      {
        id: crypto.randomUUID(),
        name: "Mortgage",
        value: 400000.0,
        apr: 0.04,
      },
    ],
    income: [
      {
        id: crypto.randomUUID(),
        name: "Salary (Net)",
        amount: 4000.0,
        retirementBehavior: "stops",
      },
      {
        id: crypto.randomUUID(),
        name: "Side Gig",
        amount: 200.0,
        retirementBehavior: "continues",
      },
      {
        id: crypto.randomUUID(),
        name: "Rental Property",
        amount: 1000.0,
        retirementBehavior: "continues",
      },
      {
        id: crypto.randomUUID(),
        name: "Pension",
        amount: 500.0,
        retirementBehavior: "starts",
      },
    ],
    expenses: [
      { id: crypto.randomUUID(), name: "Groceries", amount: 400.0 },
      { id: crypto.randomUUID(), name: "Lifestyle", amount: 500.0 },
      { id: crypto.randomUUID(), name: "Utilities", amount: 200.0 },
      { id: crypto.randomUUID(), name: "Car Insurance", amount: 180.0 },
    ],
    retirementYears: 20,
    surplusAllocations: [],
    deficitAllocations: [],
  };
}

// For type checking and fallback merging
const DEFAULT_DATA = {
  assets: [],
  debts: [],
  income: [],
  expenses: [],
  retirementYears: 20,
  surplusAllocations: [],
  deficitAllocations: [],
};

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const currentDataRef = useRef({ ...DEFAULT_DATA });
  const currentUserIdRef = useRef<string | null>(null);
  const isUpdatingFromLocalRef = useRef(false);
  const unsubscribeFirebaseRef = useRef<(() => void) | null>(null);
  const currentTimeRangeMonthsRef = useRef(360);
  const settingsVisibleRef = useRef(true);

  const getCurrentData = useCallback(() => currentDataRef.current, []);
  const getUserId = useCallback(() => currentUserIdRef.current, []);

  const updateProjection = useCallback(() => {
    const data = currentDataRef.current;
    const months = currentTimeRangeMonthsRef.current;
    const projection = calculateProjection(data, months);

    const currentAssetsEl = document.getElementById("current-assets-value");
    const netMonthlyFlowEl = document.getElementById("net-monthly-flow");
    const projected12MonthsEl = document.getElementById("projected-12-months");
    const projectionTimeLabelEl = document.getElementById("projection-time-label");

    const totalAssets = (data.assets || []).reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0);
    const totalDebts = (data.debts || []).reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0);
    const netWorth = totalAssets - totalDebts;

    if (currentAssetsEl) currentAssetsEl.textContent = formatCurrency(netWorth);
    if (netMonthlyFlowEl) {
      netMonthlyFlowEl.textContent = formatCurrency(projection.netMonthlyFlow);
      netMonthlyFlowEl.className = `text-3xl font-extrabold mt-1 tabular-nums ${projection.netMonthlyFlow >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`;
    }
    if (projected12MonthsEl) projected12MonthsEl.textContent = formatCurrency(projection.projectedNetWorth);
    if (projectionTimeLabelEl) {
      const years = Math.floor(months / 12);
      const remainingMonths = months % 12;
      let label = "Projected ";
      if (years > 0) label += `${years} Year${years > 1 ? "s" : ""}`;
      if (remainingMonths > 0) label += `${years > 0 ? " " : ""}${remainingMonths} Month${remainingMonths > 1 ? "s" : ""}`;
      label += " Net Worth";
      projectionTimeLabelEl.textContent = label;
    }

    updateChart(data, months);
    renderSurplusAllocations(data);
    renderDeficitAllocations(data);
    updateSurplusTotalStatus(data, (section: string) => renderTableCallback(section));
  }, []);

  const renderTableCallback = useCallback((section: string) => {
    renderTable(section, currentDataRef.current, {
      handleEdit: (e: Event, sec: string, id: string, field: string) => {},
      handleBlur: (e: Event, sec: string, id: string, field: string) => {
        const target = e.target as HTMLElement;
        const rawValue = target.textContent || "";
        const items = currentDataRef.current[sec] || [];
        const item = items.find((i: any) => i.id === id);
        if (!item) return;

        if (field === "name") {
          item.name = rawValue;
        } else if (field === "value" || field === "amount") {
          const parsed = parseNumberSafe(rawValue);
          item[field] = parsed;
          target.textContent = formatCurrency(parsed);
        } else if (field === "roi" || field === "apr") {
          const parsed = parseNumberSafe(rawValue, true);
          item[field] = parsed;
          target.textContent = (parsed * 100).toFixed(2) + "%";
        }

        saveToLocalStorage(currentDataRef.current);
        if (currentUserIdRef.current) {
          updateFirebaseData(currentUserIdRef.current, { [sec]: currentDataRef.current[sec] }, {
            setIsUpdatingFromLocal: (v: boolean) => { isUpdatingFromLocalRef.current = v; }
          });
        }
        updateProjection();
      },
      deleteItem: (sec: string, id: string) => {
        deleteTableItem(sec, id, currentDataRef.current, {
          updateDataCallback: (updates: any) => {
            saveToLocalStorage(currentDataRef.current);
            if (currentUserIdRef.current) {
              updateFirebaseData(currentUserIdRef.current, updates, {
                setIsUpdatingFromLocal: (v: boolean) => { isUpdatingFromLocalRef.current = v; }
              });
            }
          },
          renderTableCallback,
          renderAllocationsCallback: () => {
            renderSurplusAllocations(currentDataRef.current);
            renderDeficitAllocations(currentDataRef.current);
          },
        });
        updateProjection();
      },
      currentData: currentDataRef.current,
      updateDataCallback: (updates: any) => {
        Object.assign(currentDataRef.current, updates);
        saveToLocalStorage(currentDataRef.current);
        if (currentUserIdRef.current) {
          updateFirebaseData(currentUserIdRef.current, updates, {
            setIsUpdatingFromLocal: (v: boolean) => { isUpdatingFromLocalRef.current = v; }
          });
        }
      },
      updateProjectionCallback: updateProjection,
      renderTableCallback,
    });
  }, [updateProjection]);

  const handleAddItem = useCallback((section: string) => {
    addItem(section, currentDataRef.current, {
      updateDataCallback: (updates: any) => {
        saveToLocalStorage(currentDataRef.current);
        if (currentUserIdRef.current) {
          updateFirebaseData(currentUserIdRef.current, updates, {
            setIsUpdatingFromLocal: (v: boolean) => { isUpdatingFromLocalRef.current = v; }
          });
        }
      },
      renderTableCallback,
      renderAllocationsCallback: () => {
        renderSurplusAllocations(currentDataRef.current);
        renderDeficitAllocations(currentDataRef.current);
      },
    });
    updateProjection();
  }, [renderTableCallback, updateProjection]);

  const handleResetData = useCallback(() => {
    // Create fresh default data with new UUIDs (matching legacy app behavior)
    currentDataRef.current = createDefaultData();
    saveToLocalStorage(currentDataRef.current);
    if (currentUserIdRef.current) {
      saveCompleteData(currentUserIdRef.current, currentDataRef.current, {
        setIsUpdatingFromLocal: (v: boolean) => { isUpdatingFromLocalRef.current = v; }
      });
    }
    ["assets", "debts", "income", "expenses"].forEach(renderTableCallback);
    const retirementInput = document.getElementById("retirement-years-input") as HTMLInputElement;
    if (retirementInput) retirementInput.value = String(currentDataRef.current.retirementYears);
    
    // Ensure allocations are generated before projection
    renderSurplusAllocations(currentDataRef.current);
    renderDeficitAllocations(currentDataRef.current);
    
    destroyChart();
    updateProjection();
    hideResetModal();
    showToast("Data has been reset to defaults", "success");
  }, [renderTableCallback, updateProjection]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const savedData = loadFromLocalStorage(DEFAULT_DATA);
    if (savedData) {
      currentDataRef.current = savedData;
    } else {
      // Fresh user - no saved data, use default demo data
      currentDataRef.current = createDefaultData();
      saveToLocalStorage(currentDataRef.current);
    }

    ["assets", "debts", "income", "expenses"].forEach(renderTableCallback);
    updateProjection();

    const retirementInput = document.getElementById("retirement-years-input") as HTMLInputElement;
    if (retirementInput) {
      retirementInput.value = String(currentDataRef.current.retirementYears || 0);
      retirementInput.addEventListener("input", (e) => {
        const val = parseInt((e.target as HTMLInputElement).value) || 0;
        currentDataRef.current.retirementYears = val;
        saveToLocalStorage(currentDataRef.current);
        if (currentUserIdRef.current) {
          updateFirebaseData(currentUserIdRef.current, { retirementYears: val }, {
            setIsUpdatingFromLocal: (v: boolean) => { isUpdatingFromLocalRef.current = v; }
          });
        }
        updateProjection();
      });
    }

    // Time range buttons
    const timeRangeBtns = document.querySelectorAll(".time-range-btn");
    timeRangeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const period = parseInt((btn as HTMLElement).dataset.period || "12");
        currentTimeRangeMonthsRef.current = period;
        timeRangeBtns.forEach((b) => {
          b.classList.remove("bg-blue-600", "dark:bg-blue-600", "text-white", "dark:text-white", "border-blue-600", "dark:border-blue-600", "hover:bg-blue-700", "dark:hover:bg-blue-700");
          b.classList.add("bg-white", "dark:bg-gray-700", "text-gray-700", "dark:text-gray-300", "hover:bg-gray-50", "dark:hover:bg-gray-600");
        });
        btn.classList.remove("bg-white", "dark:bg-gray-700", "text-gray-700", "dark:text-gray-300", "hover:bg-gray-50", "dark:hover:bg-gray-600");
        btn.classList.add("bg-blue-600", "dark:bg-blue-600", "text-white", "dark:text-white", "border-blue-600", "dark:border-blue-600", "hover:bg-blue-700", "dark:hover:bg-blue-700");
        updateProjection();
      });
    });

    // Set default time range to 30 years and trigger chart update
    const defaultBtn = document.querySelector('.time-range-btn[data-period="360"]');
    if (defaultBtn) {
      defaultBtn.classList.remove("bg-white", "dark:bg-gray-700", "text-gray-700", "dark:text-gray-300", "hover:bg-gray-50", "dark:hover:bg-gray-600");
      defaultBtn.classList.add("bg-blue-600", "dark:bg-blue-600", "text-white", "dark:text-white", "border-blue-600", "dark:border-blue-600", "hover:bg-blue-700", "dark:hover:bg-blue-700");
    }
    // Ensure chart is updated after button styling is applied
    updateProjection();

    // Legend toggle
    const legendToggle = document.getElementById("legend-show-all");
    if (legendToggle) {
      legendToggle.addEventListener("change", applyLegendVisibility);
    }

    // Settings toggle
    const toggleSettingsBtn = document.getElementById("toggle-settings-btn");
    const collapsibleSettings = document.getElementById("collapsible-settings");
    const toggleSettingsIcon = document.getElementById("toggle-settings-icon");
    const toggleSettingsText = document.getElementById("toggle-settings-text");
    if (toggleSettingsBtn && collapsibleSettings) {
      toggleSettingsBtn.addEventListener("click", () => {
        settingsVisibleRef.current = !settingsVisibleRef.current;
        collapsibleSettings.classList.toggle("hidden", !settingsVisibleRef.current);
        if (toggleSettingsIcon) toggleSettingsIcon.style.transform = settingsVisibleRef.current ? "" : "rotate(-90deg)";
        if (toggleSettingsText) toggleSettingsText.textContent = settingsVisibleRef.current ? "Hide Settings" : "Show Settings";
      });
    }

    // Auth modal
    const signinTriggerBtn = document.getElementById("signin-trigger-btn");
    const authModalBackdrop = document.getElementById("auth-modal-backdrop");
    const authModalClose = document.getElementById("auth-modal-close");
    const googleSigninBtn = document.getElementById("google-signin-btn");
    const emailSigninBtn = document.getElementById("email-signin-btn");
    const emailSignupBtn = document.getElementById("email-signup-btn");
    const forgotPasswordBtn = document.getElementById("forgot-password-btn");

    if (signinTriggerBtn) signinTriggerBtn.addEventListener("click", showAuthModal);
    if (authModalBackdrop) authModalBackdrop.addEventListener("click", hideAuthModal);
    if (authModalClose) authModalClose.addEventListener("click", hideAuthModal);
    if (googleSigninBtn) googleSigninBtn.addEventListener("click", signInWithGoogle);
    if (emailSigninBtn) emailSigninBtn.addEventListener("click", signInWithEmail);
    if (emailSignupBtn) emailSignupBtn.addEventListener("click", signUpWithEmail);
    if (forgotPasswordBtn) forgotPasswordBtn.addEventListener("click", handleForgotPassword);

    // Reset modal
    const resetDataBtn = document.getElementById("reset-data-btn");
    const resetModalBackdrop = document.getElementById("reset-modal-backdrop");
    const resetCancelBtn = document.getElementById("reset-cancel-btn");
    const resetConfirmBtn = document.getElementById("reset-confirm-btn");

    if (resetDataBtn) resetDataBtn.addEventListener("click", showResetModal);
    if (resetModalBackdrop) resetModalBackdrop.addEventListener("click", hideResetModal);
    if (resetCancelBtn) resetCancelBtn.addEventListener("click", hideResetModal);
    if (resetConfirmBtn) resetConfirmBtn.addEventListener("click", handleResetData);

    // User menu dropdown
    const userMenuBtn = document.getElementById("user-menu-btn");
    const userDropdown = document.getElementById("user-dropdown");
    const userMenuChevron = document.getElementById("user-menu-chevron");
    const signoutBtn = document.getElementById("signout-btn");

    if (userMenuBtn && userDropdown) {
      userMenuBtn.addEventListener("click", () => {
        userDropdown.classList.toggle("hidden");
        if (userMenuChevron) userMenuChevron.style.transform = userDropdown.classList.contains("hidden") ? "" : "rotate(180deg)";
      });
      document.addEventListener("click", (e) => {
        if (!userMenuBtn.contains(e.target as Node) && !userDropdown.contains(e.target as Node)) {
          userDropdown.classList.add("hidden");
          if (userMenuChevron) userMenuChevron.style.transform = "";
        }
      });
    }

    if (signoutBtn) {
      signoutBtn.addEventListener("click", () => {
        handleSignOut({
          onSignOutComplete: () => {
            currentDataRef.current = { ...DEFAULT_DATA };
            const saved = loadFromLocalStorage(DEFAULT_DATA);
            if (saved) currentDataRef.current = saved;
            ["assets", "debts", "income", "expenses"].forEach(renderTableCallback);
            updateProjection();
          },
          clearAIInsightsState,
          updateAIInsightsUI: () => updateAIInsightsUI(null),
        });
      });
    }

    // Email verification
    const resendVerificationBtn = document.getElementById("resend-verification-btn");
    if (resendVerificationBtn) resendVerificationBtn.addEventListener("click", resendVerificationEmail);
    setOnVerified(() => updateAIInsightsUI(currentUserIdRef.current));
    initializeVisibilityListener();

    // Add buttons
    const assetsAddBtn = document.getElementById("assets-add-btn");
    const debtsAddBtn = document.getElementById("debts-add-btn");
    const incomeAddBtn = document.getElementById("income-add-btn");
    const expensesAddBtn = document.getElementById("expenses-add-btn");

    if (assetsAddBtn) assetsAddBtn.addEventListener("click", () => handleAddItem("assets"));
    if (debtsAddBtn) debtsAddBtn.addEventListener("click", () => handleAddItem("debts"));
    if (incomeAddBtn) incomeAddBtn.addEventListener("click", () => handleAddItem("income"));
    if (expensesAddBtn) expensesAddBtn.addEventListener("click", () => handleAddItem("expenses"));

    // AI Insights
    initializeAIInsights(getUserId, getCurrentData);

    // Firebase auth state listener
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubscribeFirebaseRef.current) {
        unsubscribeFirebaseRef.current();
        unsubscribeFirebaseRef.current = null;
      }

      if (user) {
        currentUserIdRef.current = user.uid;
        updateUIForAuthState(user);
        updateUserDisplay(user);

        if (!user.emailVerified) {
          showEmailVerificationBanner(user);
        } else {
          hideEmailVerificationBanner();
        }

        const unsubscribe = await loadDataAndStartListener(user.uid, currentDataRef.current, {
          onDataLoaded: (data: any) => {
            currentDataRef.current = data;
            ["assets", "debts", "income", "expenses"].forEach(renderTableCallback);
            const retInput = document.getElementById("retirement-years-input") as HTMLInputElement;
            if (retInput) retInput.value = String(data.retirementYears || 0);
            updateProjection();
          },
          onDataUpdated: (data: any) => {
            currentDataRef.current = data;
            ["assets", "debts", "income", "expenses"].forEach(renderTableCallback);
            updateProjection();
          },
          saveToLocalStorage,
          setIsUpdatingFromLocal: (v: boolean) => { isUpdatingFromLocalRef.current = v; },
          getIsUpdatingFromLocal: () => isUpdatingFromLocalRef.current,
        });
        unsubscribeFirebaseRef.current = unsubscribe;
        updateAIInsightsUI(user.uid);
      } else {
        currentUserIdRef.current = null;
        updateUIForAuthState(null);
        hideEmailVerificationBanner();
        updateAIInsightsUI(null);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeFirebaseRef.current) unsubscribeFirebaseRef.current();
      destroyChart();
    };
  }, [mounted, renderTableCallback, updateProjection, handleAddItem, handleResetData, getCurrentData, getUserId]);

  if (!mounted) {
    return null;
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <div className="bg-gray-100 dark:bg-gray-900 font-sans p-4 md:p-8 min-h-screen transition-colors duration-200">
        {/* Auth Modal */}
        <div id="auth-modal" className="hidden fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" id="auth-modal-backdrop"></div>
          <div className="relative bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl max-w-md w-full mx-4">
            <button id="auth-modal-close" className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 text-center">Sign In to Sync</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-center">Save your data to the cloud and access it from any device</p>
            <div id="auth-error" className="hidden mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-400 text-sm"></div>
            <button id="google-signin-btn" className="w-full flex items-center justify-center gap-3 p-3 mb-4 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition font-medium text-gray-700 dark:text-gray-200">
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </button>
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600"></div>
              <span className="text-sm text-gray-500 dark:text-gray-400">or</span>
              <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600"></div>
            </div>
            <div className="space-y-4">
              <div>
                <label htmlFor="auth-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input type="email" id="auth-email" className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="you@example.com" />
              </div>
              <div>
                <label htmlFor="auth-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                <input type="password" id="auth-password" className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="••••••••" />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input type="checkbox" id="remember-email" className="w-4 h-4 text-blue-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500" />
                  <label htmlFor="remember-email" className="ml-2 text-sm text-gray-600 dark:text-gray-400">Remember email</label>
                </div>
                <button type="button" id="forgot-password-btn" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Forgot password?</button>
              </div>
              <div className="flex gap-3">
                <button id="email-signin-btn" className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition">Sign In</button>
                <button id="email-signup-btn" className="flex-1 py-2 px-4 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition">Sign Up</button>
              </div>
            </div>
          </div>
        </div>

        {/* Reset Modal */}
        <div id="reset-modal" className="hidden fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" id="reset-modal-backdrop"></div>
          <div className="relative bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
                <svg className="h-6 w-6 text-red-600 dark:text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Reset All Data?</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">This will reset all your financial data to the default values. This action cannot be undone.</p>
              <div className="flex gap-3">
                <button type="button" id="reset-cancel-btn" className="flex-1 py-2 px-4 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition">Cancel</button>
                <button type="button" id="reset-confirm-btn" className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition">Reset Data</button>
              </div>
            </div>
          </div>
        </div>

        {/* Main App */}
        <div id="app-section">
          {/* Header */}
          <header className="mb-6 relative">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div className="flex flex-col">
                <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                  Valenscope
                  <span className="relative w-8 h-8" aria-hidden="true">
                    <img src="/images/icon.png" alt="Valenscope icon" className="absolute inset-0 w-8 h-8 object-contain dark:opacity-0 opacity-100 transition-opacity duration-200" />
                    <img src="/images/icon48_rounded.png" alt="Valenscope icon" className="absolute inset-0 w-8 h-8 object-contain opacity-0 dark:opacity-100 transition-opacity duration-200" />
                  </span>
                </h1>
                <p className="text-lg font-medium text-blue-600 dark:text-blue-400 mt-2">Financial Forecasting & Portfolio Modeling</p>
                <p id="sync-status" className="text-sm text-gray-500 dark:text-gray-400 mt-2">Data saved locally. Sign in to sync across devices.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-4 sm:mt-0">
                <ThemeToggle />
                <button type="button" id="reset-data-btn" className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors h-10 w-10 flex items-center justify-center group" title="Reset All Data">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600 dark:text-gray-300 group-hover:text-red-600 dark:group-hover:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <button id="signin-trigger-btn" className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition h-10">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M5.5 16a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 16h-8z" />
                  </svg>
                  <span>Sign in to sync</span>
                </button>
                <div id="user-info" className="relative hidden">
                  <button id="user-menu-btn" className="flex items-center gap-2 px-3 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg h-10 transition">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                    <span id="user-email-display" className="max-w-[250px] truncate">user@example.com</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 transition-transform" id="user-menu-chevron" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <div id="user-dropdown" className="hidden absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                    <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Signed in as</p>
                      <p id="user-email-dropdown" className="text-sm font-medium text-gray-900 dark:text-white truncate">user@example.com</p>
                    </div>
                    <button id="signout-btn" className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      Sign out
                    </button>
                  </div>
                </div>
              </div>
            </div>
            {/* Email verification banner */}
            <div id="email-verification-banner" className="hidden mt-3 p-3 border-l-4 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg w-fit max-w-full">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center h-9 w-9 rounded-md bg-yellow-100 dark:bg-yellow-800 text-yellow-700 dark:text-yellow-200">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M3 8l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M21 8v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">Your email <span className="font-medium email-to-verify">user@example.com</span> is not verified. Please check your inbox.</p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">Verify to enable full sync features.</p>
                  </div>
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  <button id="resend-verification-btn" className="py-1 px-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md text-sm">Resend email</button>
                </div>
              </div>
            </div>
          </header>

          {/* Data Tables Section */}
          <div className="mb-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Your Financial Data</h2>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-[#faf5ff] dark:bg-[#30244f] p-3 rounded-lg border border-[#e9d5ff] dark:border-[#6b21a8]">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-600 dark:text-purple-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-semibold text-purple-800 dark:text-purple-300">Retirement Planning:</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700 dark:text-gray-300">Retire in</label>
                  <input type="number" id="retirement-years-input" min="0" max="100" defaultValue="0" className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-center tabular-nums bg-white dark:bg-gray-700 dark:text-white" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">years</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Assets Table */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                <h3 className="text-xl font-bold text-green-700 dark:text-green-400 mb-1 border-b dark:border-gray-700 pb-2">📈 Assets & Investments</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Things you own that grow in value</p>
                <div className="overflow-x-auto max-h-64">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead><tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"><th className="py-2 px-2 w-8"></th><th className="py-2 px-4">Name</th><th className="py-2 px-4 text-right">Value ($)</th><th className="py-2 px-4 text-right">Est. ROI (%)</th><th className="py-2 px-4 text-right"></th></tr></thead>
                    <tbody id="assets-tbody" className="divide-y divide-gray-100 dark:divide-gray-700 text-sm"></tbody>
                  </table>
                </div>
                <button id="assets-add-btn" className="mt-4 w-full flex items-center justify-center space-x-2 p-2 border border-green-300 dark:border-green-600 rounded-lg text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 transition">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
                  <span>Add Asset</span>
                </button>
              </div>
              {/* Debts Table */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                <h3 className="text-xl font-bold text-red-700 dark:text-red-400 mb-1 border-b dark:border-gray-700 pb-2">💳 Debts & Loans</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Money you owe that accrues interest</p>
                <div className="overflow-x-auto max-h-64">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead><tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"><th className="py-2 px-2 w-8"></th><th className="py-2 px-4">Name</th><th className="py-2 px-4 text-right">Balance ($)</th><th className="py-2 px-4 text-right">APR (%)</th><th className="py-2 px-4 text-right"></th></tr></thead>
                    <tbody id="debts-tbody" className="divide-y divide-gray-100 dark:divide-gray-700 text-sm"></tbody>
                  </table>
                </div>
                <button id="debts-add-btn" className="mt-4 w-full flex items-center justify-center space-x-2 p-2 border border-red-300 dark:border-red-600 rounded-lg text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
                  <span>Add Debt</span>
                </button>
              </div>
              {/* Income Table */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                <h3 className="text-xl font-bold text-blue-700 dark:text-blue-400 mb-1 border-b dark:border-gray-700 pb-2">💰 Monthly Income</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Regular money coming in each month</p>
                <div className="overflow-x-auto max-h-64">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead><tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"><th className="py-2 px-2 w-8"></th><th className="py-2 px-4">Name</th><th className="py-2 px-4 text-right">Amount ($)</th><th className="py-2 px-4 text-center">Retirement Behavior</th><th className="py-2 px-4 text-right"></th></tr></thead>
                    <tbody id="income-tbody" className="divide-y divide-gray-100 dark:divide-gray-700 text-sm"></tbody>
                  </table>
                </div>
                <button id="income-add-btn" className="mt-4 w-full flex items-center justify-center space-x-2 p-2 border border-blue-300 dark:border-blue-600 rounded-lg text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
                  <span>Add Income Source</span>
                </button>
              </div>
              {/* Expenses Table */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                <h3 className="text-xl font-bold text-orange-700 dark:text-orange-400 mb-1 border-b dark:border-gray-700 pb-2">🧾 Monthly Expenses</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Regular costs and bills each month</p>
                <div className="overflow-x-auto max-h-64">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead><tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"><th className="py-2 px-2 w-8"></th><th className="py-2 px-4">Name</th><th className="py-2 px-4 text-right">Amount ($)</th><th className="py-2 px-4 text-right"></th></tr></thead>
                    <tbody id="expenses-tbody" className="divide-y divide-gray-100 dark:divide-gray-700 text-sm"></tbody>
                  </table>
                </div>
                <button id="expenses-add-btn" className="mt-4 w-full flex items-center justify-center space-x-2 p-2 border border-orange-300 dark:border-orange-600 rounded-lg text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/30 transition">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
                  <span>Add Expense Item</span>
                </button>
              </div>
            </div>
          </div>

          {/* Projection Summary */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl mb-8 mt-8 border border-blue-200 dark:border-blue-900">
            <h2 className="text-2xl font-bold text-blue-800 dark:text-blue-400 mb-4 flex items-center">Projection Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg border-l-4 border-blue-500 shadow-md">
                <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">Current Assets</p>
                <p className="text-3xl font-extrabold text-blue-700 dark:text-blue-400 mt-1 tabular-nums"><span id="current-assets-value">$0.00</span></p>
                <p className="text-xs text-gray-400 mt-1">Total value of all assets and investments.</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border-l-4 border-gray-500 shadow-md">
                <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">Net Monthly Cash Flow</p>
                <p className="text-3xl font-extrabold mt-1 tabular-nums" id="net-monthly-flow">$0.00</p>
                <p className="text-xs text-gray-400 mt-1">Total Income - Total Expenses.</p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg border-l-4 border-green-500 shadow-md">
                <p className="text-sm font-semibold text-gray-600 dark:text-gray-300" id="projection-time-label">Projected 30 Years Net Worth</p>
                <p className="text-3xl font-extrabold text-green-700 dark:text-green-400 mt-1 tabular-nums" id="projected-12-months">$0.00</p>
                <p className="text-xs text-gray-400 mt-1">Assets with ROI + net cash flow.</p>
              </div>
            </div>
            {/* Settings Toggle */}
            <div className="mt-4">
              <button id="toggle-settings-btn" className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition">
                <svg id="toggle-settings-icon" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 transition-transform duration-200" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                <span id="toggle-settings-text">Hide Settings</span>
              </button>
            </div>
            <div id="collapsible-settings" className="transition-all duration-300 overflow-hidden">
              <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <div className="flex items-center gap-2 mb-3"><span className="text-sm font-semibold text-emerald-800 dark:text-emerald-400">Surplus Cash Flow Allocation</span></div>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-3">Surplus is automatically allocated: highest APR debts are paid first, then remaining surplus goes to the highest yield investment.</p>
                <div id="surplus-allocations-list" className="space-y-2"></div>
              </div>
              <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/30 rounded-lg border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-2 mb-3"><span className="text-sm font-semibold text-amber-800 dark:text-amber-400">Deficit Coverage (Liquidation Order)</span></div>
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">When expenses exceed income, assets are liquidated starting from lowest ROI.</p>
                <div id="deficit-allocations-list" className="space-y-2"></div>
              </div>
            </div>
          </div>

          {/* Chart Section */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl mb-8 border border-blue-200 dark:border-blue-900">
            <div id="projection-header" className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
              <h2 className="text-2xl font-bold text-blue-800 dark:text-blue-400 mb-4 md:mb-0 whitespace-nowrap">Financial Projection Chart</h2>
              <div id="time-range-group" className="flex flex-wrap gap-2">
                {[1, 3, 6, 12, 60, 120, 240, 360, 480, 720, 960].map((period) => (
                  <button key={period} data-period={period} className="time-range-btn px-3 py-1 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition">
                    {period === 1 ? "1 Month" : period === 3 ? "3 Months" : period === 6 ? "6 Months" : period === 12 ? "1 Year" : period === 60 ? "5 Years" : period === 120 ? "10 Years" : period === 240 ? "20 Years" : period === 360 ? "30 Years" : period === 480 ? "40 Years" : period === 720 ? "60 Years" : "80 Years"}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative projection-chart-wrapper" style={{ height: "500px" }}><canvas id="projectionChart"></canvas></div>
            {/* Legend */}
            <div id="chart-legend" className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Legend</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Show all</span>
                  <div className="relative"><input type="checkbox" id="legend-show-all" className="sr-only peer" /><div className="w-9 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:bg-emerald-500 transition-colors"></div><div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform"></div></div>
                </label>
              </div>
              <div id="legend-items" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 text-sm">
                <div className="flex flex-col gap-1"><div className="flex items-center gap-2"><span className="w-4 h-0.5 bg-green-500 flex-shrink-0"></span><span className="text-gray-700 dark:text-gray-300 font-medium">Net Worth (+)</span></div><span className="text-xs text-gray-400 dark:text-gray-500 ml-6">Assets minus debts</span></div>
                <div className="flex flex-col gap-1"><div className="flex items-center gap-2"><span className="w-4 h-0.5 bg-red-500 flex-shrink-0"></span><span className="text-gray-700 dark:text-gray-300 font-medium">Net Worth (−)</span></div><span className="text-xs text-gray-400 dark:text-gray-500 ml-6">You owe more than you own</span></div>
                <div id="legend-debt-payoff" className="hidden flex-col gap-1"><div className="flex items-center gap-2"><span className="w-4 h-0.5 border-t-2 border-dashed border-red-400 flex-shrink-0"></span><span className="text-gray-700 dark:text-gray-300 font-medium">Debt Paid Off</span></div></div>
                <div id="legend-net-zero" className="hidden flex-col gap-1"><div className="flex items-center gap-2"><span className="w-4 h-0.5 border-t-2 border-dashed border-green-500 flex-shrink-0"></span><span className="text-gray-700 dark:text-gray-300 font-medium">🎯 Net Zero</span></div></div>
                <div id="legend-fi" className="hidden flex-col gap-1"><div className="flex items-center gap-2"><span className="w-4 h-0.5 border-t-2 border-dashed border-yellow-400 flex-shrink-0"></span><span className="text-gray-700 dark:text-gray-300 font-medium">🌟 FI Achieved</span></div></div>
                <div id="legend-retirement" className="hidden flex-col gap-1"><div className="flex items-center gap-2"><span className="w-4 h-0.5 border-t-2 border-dashed border-purple-500 flex-shrink-0"></span><span className="text-gray-700 dark:text-gray-300 font-medium">🏖️ Retirement</span></div></div>
                <div id="legend-top50" className="hidden flex-col gap-1"><div className="flex items-center gap-2"><span className="w-4 h-0.5 border-t-2 border-dashed border-blue-500 flex-shrink-0"></span><span className="text-gray-700 dark:text-gray-300 font-medium">📊 Top 50%</span></div></div>
                <div id="legend-top10" className="hidden flex-col gap-1"><div className="flex items-center gap-2"><span className="w-4 h-0.5 border-t-2 border-dashed border-indigo-500 flex-shrink-0"></span><span className="text-gray-700 dark:text-gray-300 font-medium">💎 Top 10%</span></div></div>
                <div id="legend-top1" className="hidden flex-col gap-1"><div className="flex items-center gap-2"><span className="w-4 h-0.5 border-t-2 border-dashed border-violet-500 flex-shrink-0"></span><span className="text-gray-700 dark:text-gray-300 font-medium">👑 Top 1%</span></div></div>
                <div id="legend-top01" className="hidden flex-col gap-1"><div className="flex items-center gap-2"><span className="w-4 h-0.5 border-t-2 border-dashed border-purple-400 flex-shrink-0"></span><span className="text-gray-700 dark:text-gray-300 font-medium">🏆 Top 0.1%</span></div></div>
              </div>
            </div>
          </div>
        </div>

        {/* AI Insights Section */}
        <div id="ai-insights-section" className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl mb-8 border border-purple-200 dark:border-purple-900">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h2 className="text-2xl font-bold text-purple-800 dark:text-purple-400 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
              AI Financial Insights
            </h2>
            <div className="flex items-center gap-3">
              <span id="ai-daily-limit" className="text-xs text-gray-500 dark:text-gray-400"><span id="ai-requests-used">0</span>/<span id="ai-daily-limit-value">5</span> used today</span>
              <button id="generate-insights-btn" className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition">
                <svg id="insights-icon-sparkle" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" /></svg>
                <svg id="insights-icon-loading" className="hidden animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span id="insights-btn-text">Generate Insights</span>
              </button>
            </div>
          </div>
          <div id="ai-cooldown-bar" className="hidden mb-4"><div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"><span id="ai-cooldown-text">Please wait...</span><div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"><div id="ai-cooldown-progress" className="h-full bg-purple-500" style={{ width: "100%" }}></div></div></div></div>
          <div id="ai-limit-reached" className="hidden p-4 mb-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg"><div className="flex items-center gap-3"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg><span className="text-sm text-amber-800 dark:text-amber-200">Daily limit reached. Come back tomorrow!</span></div></div>
          <div id="ai-signin-required" className="hidden p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg"><div className="flex items-center gap-3"><span className="text-sm text-blue-800 dark:text-blue-200">Sign in to unlock AI-powered financial insights.</span></div></div>
          <div id="ai-verify-required" className="hidden p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg"><div className="flex items-center gap-3"><span className="text-sm text-yellow-800 dark:text-yellow-200">Please verify your email to use AI insights.</span></div></div>
          <div id="ai-insights-content" className="hidden"><div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800"><div id="ai-insights-text" className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300"></div><p id="ai-insights-timestamp" className="mt-3 text-xs text-gray-500 dark:text-gray-400"></p></div></div>
          <div id="ai-insights-empty" className="hidden text-center py-8"><svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Click &quot;Generate Insights&quot; to get personalized AI analysis.</p></div>
          <div id="ai-insights-error" className="hidden p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg"><div className="flex items-center gap-3"><span id="ai-error-message" className="text-sm text-red-800 dark:text-red-200">An error occurred. Please try again.</span></div></div>
        </div>

        {/* Calculation Formulas */}
        <CalculationFormulas />

        {/* Footer */}
        <footer className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>© {new Date().getFullYear()} Valenscope. All rights reserved.</p>
        </footer>
      </div>
    </ThemeProvider>
  );
}
