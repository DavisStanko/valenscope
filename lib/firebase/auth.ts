// @ts-nocheck
"use client";

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";

import { getClientAuth, getGoogleProvider } from "@/lib/firebase/client";
import { showToast } from "@/lib/ui/toast";
import { hideAuthModal, showAuthError } from "@/lib/ui/modals";
import { saveRememberedEmail } from "@/lib/storage/local-storage";
import { startVerificationAutoCheck } from "@/lib/features/verification";

export const auth = getClientAuth();
const googleProvider = getGoogleProvider();

export function getAuthErrorMessage(code) {
  const messages = {
    "auth/invalid-email": "Invalid email address.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/weak-password": "Password is too weak.",
    "auth/popup-closed-by-user": "Sign-in popup was closed.",
    "auth/cancelled-popup-request": "Sign-in was cancelled.",
    "auth/invalid-credential": "Invalid email or password.",
    "auth/popup-blocked":
      "Popup was blocked. Please allow popups for this site.",
    "auth/network-request-failed":
      "Network error. Please check your connection.",
    "auth/unauthorized-domain":
      "This domain is not authorized for Google sign-in. Please use email sign-in instead.",
    "auth/operation-not-allowed":
      "Google sign-in is not enabled. Please use email sign-in.",
    "auth/internal-error": "An internal error occurred. Please try again.",
  };
  return messages[code] || `An error occurred (${code}). Please try again.`;
}

export async function signInWithGoogle() {
  try {
    showAuthError("");
    const result = await signInWithPopup(auth, googleProvider);
    hideAuthModal();
    showToast(
      `Signed in as ${
        result.user?.email || result.user?.displayName || "Google user"
      }`,
      "success"
    );
  } catch (error) {
    console.error("Google sign-in error:", error.code, error.message);
    showAuthError(getAuthErrorMessage(error.code));
  }
}

export async function signInWithEmail() {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;

  if (!email || !password) {
    showAuthError("Please enter both email and password.");
    return;
  }

  try {
    showAuthError("");
    const result = await signInWithEmailAndPassword(auth, email, password);
    saveRememberedEmail(email);
    hideAuthModal();
    showToast(`Signed in as ${result.user?.email || email}`, "success");
  } catch (error) {
    console.error("Email sign-in error:", error.code, error.message);
    showAuthError(getAuthErrorMessage(error.code));
  }
}

export async function signUpWithEmail() {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;

  if (!email || !password) {
    showAuthError("Please enter both email and password.");
    return;
  }

  if (password.length < 6) {
    showAuthError("Password must be at least 6 characters.");
    return;
  }

  try {
    showAuthError("");
    const result = await createUserWithEmailAndPassword(auth, email, password);

    try {
      await sendEmailVerification(result.user);
      showToast("Account created! Check your email to verify.", "success");
    } catch (sendErr) {
      console.error("Error sending verification email:", sendErr);
      showToast(
        "Account created but could not send verification email.",
        "warning"
      );
    }

    saveRememberedEmail(email);
    hideAuthModal();

    startVerificationAutoCheck();
  } catch (error) {
    console.error("Email sign-up error:", error.code, error.message);
    showAuthError(getAuthErrorMessage(error.code));
  }
}

export async function handleForgotPassword() {
  const email = document.getElementById("auth-email").value.trim();

  if (!email) {
    showAuthError("Please enter your email address first.");
    return;
  }

  try {
    showAuthError("");
    await sendPasswordResetEmail(auth, email);
    showToast("Password reset email sent! Check your inbox.", "success");
  } catch (error) {
    console.error("Password reset error:", error.code, error.message);
    showAuthError(getAuthErrorMessage(error.code));
  }
}

export async function handleSignOut(callbacks = {}) {
  const { onSignOutComplete, clearAIInsightsState, updateAIInsightsUI } =
    callbacks;

  try {
    const userDropdown = document.getElementById("user-dropdown");
    const userMenuChevron = document.getElementById("user-menu-chevron");
    if (userDropdown) userDropdown.classList.add("hidden");
    if (userMenuChevron) userMenuChevron.style.transform = "";

    await firebaseSignOut(auth);

    if (clearAIInsightsState) {
      clearAIInsightsState();
    }
    if (updateAIInsightsUI) {
      updateAIInsightsUI();
    }

    if (onSignOutComplete) {
      onSignOutComplete();
    }

    showToast("Signed out successfully", "success");
  } catch (error) {
    console.error("Sign out error:", error);
    showToast("Error signing out", "error");
  }
}

export { onAuthStateChanged, sendEmailVerification };
