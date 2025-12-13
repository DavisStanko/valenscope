// @ts-nocheck
"use client";

import { auth, sendEmailVerification } from "@/lib/firebase/auth";
import { showToast } from "@/lib/ui/toast";

let verificationCheckInterval = null;
let resendCooldown = 0;
let resendTimer = null;
let onVerifiedCallback = null;

export function setOnVerified(callback) {
  onVerifiedCallback = callback;
}

export async function showEmailVerificationBanner(user) {
  const banner = document.getElementById("email-verification-banner");
  if (!banner) return;

  const currentUser = auth.currentUser || user;
  if (!currentUser) return;

  // Fast check
  if (currentUser.emailVerified) return;

  // Wait a bit to let initial auth settle if needed
  await new Promise(resolve => setTimeout(resolve, 500));

  // Explicit deep check
  try {
      // Force token refresh gets latest claims from server
      await currentUser.getIdToken(true);
      await currentUser.reload(); 

      // Check again after refresh
      if (auth.currentUser?.emailVerified || currentUser.emailVerified) return;
  } catch (e) {
      console.error("Error refreshing user for verification check", e);
      // If we can't verify status, assume verified/error and don't show banner to avoid flash.
      // The auto-check loop will eventually catch it if they really are unverified.
      return; 
  }

  // Final check of DOM existence
  if (document.getElementById("email-verification-banner") === null) return;

  const emailSpan = banner.querySelector(".email-to-verify");
  if (emailSpan) emailSpan.textContent = currentUser.email || "";
  banner.classList.remove("hidden");
  
  startVerificationAutoCheck();
  updateResendButton();
}

export function hideEmailVerificationBanner() {
  const banner = document.getElementById("email-verification-banner");
  if (!banner) return;
  banner.classList.add("hidden");
}

export async function resendVerificationEmail() {
  const user = auth.currentUser;
  if (!user) {
    showToast("No signed-in user.", "error");
    return;
  }

  if (user.emailVerified) {
    hideEmailVerificationBanner();
    showToast("Your email is already verified!", "success");
    if (onVerifiedCallback) onVerifiedCallback();
    return;
  }

  if (resendCooldown > 0) {
    showToast(`Please wait ${resendCooldown}s before resending.`, "warning");
    return;
  }

  try {
    await sendEmailVerification(user);
    showToast("Verification email sent! Check your inbox.", "success");

    resendCooldown = 60;
    updateResendButton();

    resendTimer = setInterval(() => {
      resendCooldown--;
      updateResendButton();

      if (resendCooldown <= 0) {
        clearInterval(resendTimer);
        resendTimer = null;
      }
    }, 1000);
  } catch (error) {
    console.error("Resend verification error:", error);
    showToast("Could not resend email. Try again later.", "error");
  }
}

export function startVerificationAutoCheck() {
  if (verificationCheckInterval) {
    clearInterval(verificationCheckInterval);
  }

  verificationCheckInterval = setInterval(async () => {
    if (document.hidden) return;

    const user = auth.currentUser;
    if (!user) {
      stopVerificationAutoCheck();
      return;
    }

    if (user.emailVerified) {
      stopVerificationAutoCheck();
      hideEmailVerificationBanner();
      if (onVerifiedCallback) onVerifiedCallback();
      return;
    }

    try {
      await user.reload();
      if (user.emailVerified) {
        hideEmailVerificationBanner();
        showToast("Email verified! You're all set.", "success");
        stopVerificationAutoCheck();
        if (onVerifiedCallback) onVerifiedCallback();
      }
    } catch (error) {
      console.error("Auto-check verification error:", error);
    }
  }, 3000);
}

export function stopVerificationAutoCheck() {
  if (verificationCheckInterval) {
    clearInterval(verificationCheckInterval);
    verificationCheckInterval = null;
  }
}

function updateResendButton() {
  const btn = document.getElementById("resend-verification-btn");
  if (!btn) return;

  if (resendCooldown > 0) {
    btn.disabled = true;
    btn.textContent = `Resend (${resendCooldown}s)`;
    btn.classList.add("opacity-50", "cursor-not-allowed");
  } else {
    btn.disabled = false;
    btn.textContent = "Resend email";
    btn.classList.remove("opacity-50", "cursor-not-allowed");
  }
}

export function initializeVisibilityListener() {
  document.addEventListener("visibilitychange", async () => {
    if (!document.hidden) {
      const user = auth.currentUser;
      if (user && !user.emailVerified) {
        try {
          await user.reload();
          if (user.emailVerified) {
            hideEmailVerificationBanner();
            showToast("Email verified! Welcome back.", "success");
            if (onVerifiedCallback) onVerifiedCallback();
          }
        } catch (error) {
          console.error("Visibility check error:", error);
        }
      }
    }
  });
}
