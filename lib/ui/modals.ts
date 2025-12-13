// @ts-nocheck
"use client";

import { loadRememberedEmail } from "@/lib/storage/local-storage";

export function showAuthModal() {
  const modal = document.getElementById("auth-modal");
  if (modal) {
    modal.classList.remove("hidden");
    loadRememberedEmail();
  }
}

export function hideAuthModal() {
  const modal = document.getElementById("auth-modal");
  if (modal) modal.classList.add("hidden");
  showAuthError("");
}

export function showResetModal() {
  const modal = document.getElementById("reset-modal");
  if (modal) modal.classList.remove("hidden");
}

export function hideResetModal() {
  const modal = document.getElementById("reset-modal");
  if (modal) modal.classList.add("hidden");
}

export function showAuthError(message) {
  const errorEl = document.getElementById("auth-error");
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.toggle("hidden", !message);
  }
}

export function updateUIForAuthState(user) {
  const userInfo = document.getElementById("user-info");
  const signinBtn = document.getElementById("signin-trigger-btn");
  const syncStatus = document.getElementById("sync-status");

  if (user) {
    if (userInfo) userInfo.classList.remove("hidden");
    if (signinBtn) signinBtn.classList.add("hidden");
    if (syncStatus) {
      syncStatus.textContent = "✓ Synced to cloud";
      syncStatus.classList.remove("text-gray-500");
      syncStatus.classList.add("text-green-600", "dark:text-green-400");
    }
  } else {
    if (userInfo) userInfo.classList.add("hidden");
    if (signinBtn) signinBtn.classList.remove("hidden");
    if (syncStatus) {
      syncStatus.textContent =
        "Data saved locally. Sign in to sync across devices.";
      syncStatus.classList.remove("text-green-600", "dark:text-green-400");
      syncStatus.classList.add("text-gray-500");
    }
  }
}

export function updateUserDisplay(user) {
  const userEmailEl = document.getElementById("user-email-display");
  const userEmailDropdown = document.getElementById("user-email-dropdown");

  if (user) {
    const email = user.email || "Google User";
    if (userEmailEl) userEmailEl.textContent = email;
    if (userEmailDropdown) userEmailDropdown.textContent = email;
  }
}
