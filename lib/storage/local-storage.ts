// @ts-nocheck
"use client";

export const LOCAL_STORAGE_KEY = "valenscope_data";
const REMEMBERED_EMAIL_KEY = "valenscope_remembered_email";

export function loadFromLocalStorage(initialData) {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      const merged = {
        ...initialData,
        ...data,
        assets: data.assets || [],
        debts: data.debts || [],
        income: data.income || [],
        expenses: data.expenses || [],
      };
      return merged;
    }
  } catch (err) {
    console.error("Error loading from localStorage:", err);
  }
  return null;
}

export function saveToLocalStorage(data) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("Error saving to localStorage:", err);
  }
}

export function loadRememberedEmail() {
  const emailInput = document.getElementById("auth-email");
  const rememberCheckbox = document.getElementById("remember-email");
  const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);

  if (savedEmail && emailInput) {
    emailInput.value = savedEmail;
    if (rememberCheckbox) rememberCheckbox.checked = true;
  }
}

export function saveRememberedEmail(email) {
  const rememberCheckbox = document.getElementById("remember-email");
  if (rememberCheckbox && rememberCheckbox.checked) {
    localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
  } else {
    localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  }
}

export function clearRememberedEmail() {
  localStorage.removeItem(REMEMBERED_EMAIL_KEY);
}
