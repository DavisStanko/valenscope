// @ts-nocheck
"use client";

import { ref, set, get, onValue, update } from "firebase/database";

import { getClientDb } from "@/lib/firebase/client";

const db = getClientDb();

export function getUserDataRef(userId) {
  if (!userId) return null;
  return ref(db, `users/${userId}/financial_data`);
}

export function getAIRateLimitRef(userId) {
  if (!userId) return null;
  return ref(db, `users/${userId}/ai_rate_limit`);
}

export async function loadDataAndStartListener(
  userId,
  initialData,
  callbacks = {}
) {
  const {
    onDataLoaded,
    onDataUpdated,
    saveToLocalStorage,
    setIsUpdatingFromLocal,
    getIsUpdatingFromLocal,
  } = callbacks;

  if (!userId) return null;

  const userRef = getUserDataRef(userId);
  if (!userRef) return null;

  const snapshot = await get(userRef);

  if (snapshot.exists()) {
    const data = snapshot.val();
    const merged = {
      ...initialData,
      ...data,
      assets: data.assets || [],
      debts: data.debts || [],
      income: data.income || [],
      expenses: data.expenses || [],
    };

    if (onDataLoaded) {
      onDataLoaded(merged);
    }
    if (saveToLocalStorage) {
      saveToLocalStorage(merged);
    }
  } else {
    // If no data exists, save initialData
    if (initialData) {
      await set(userRef, initialData);
      
      if (onDataLoaded) {
        onDataLoaded(initialData);
      }
    }
  }

  const unsubscribe = onValue(
    userRef,
    (snapshot) => {
      if (getIsUpdatingFromLocal && getIsUpdatingFromLocal()) {
        return;
      }

      if (snapshot.exists()) {
        const data = snapshot.val();
        const merged = {
          ...initialData,
          ...data,
          assets: data.assets || [],
          debts: data.debts || [],
          income: data.income || [],
          expenses: data.expenses || [],
        };

        if (onDataUpdated) {
          onDataUpdated(merged);
        }
        if (saveToLocalStorage) {
          saveToLocalStorage(merged);
        }
      }
    },
    (error) => {
      console.error("Firebase data error:", error);
    }
  );

  return unsubscribe;
}

export async function updateFirebaseData(userId, updates, callbacks = {}) {
  const { setIsUpdatingFromLocal } = callbacks;

  if (!userId) return;

  try {
    if (setIsUpdatingFromLocal) {
      setIsUpdatingFromLocal(true);
    }

    const userRef = getUserDataRef(userId);
    await update(userRef, updates);

    setTimeout(() => {
      if (setIsUpdatingFromLocal) {
        setIsUpdatingFromLocal(false);
      }
    }, 500);
  } catch (error) {
    console.error("Error saving data to Firebase:", error);
    if (setIsUpdatingFromLocal) {
      setIsUpdatingFromLocal(false);
    }
  }
}

export async function saveCompleteData(userId, data, callbacks = {}) {
  const { setIsUpdatingFromLocal } = callbacks;

  if (!userId) return;

  try {
    if (setIsUpdatingFromLocal) {
      setIsUpdatingFromLocal(true);
    }

    const userRef = getUserDataRef(userId);
    await set(userRef, data);

    setTimeout(() => {
      if (setIsUpdatingFromLocal) {
        setIsUpdatingFromLocal(false);
      }
    }, 500);
  } catch (error) {
    console.error("Error saving reset data to Firebase:", error);
    if (setIsUpdatingFromLocal) {
      setIsUpdatingFromLocal(false);
    }
  }
}

export async function getFirebaseAIRateLimitData(userId) {
  if (!userId) return null;

  try {
    const rateLimitRef = getAIRateLimitRef(userId);
    const snapshot = await get(rateLimitRef);
    if (snapshot.exists()) {
      return snapshot.val();
    }
  } catch (error) {
    console.error("Error fetching AI rate limit data:", error);
  }

  return null;
}

export async function saveFirebaseAIRateLimitData(userId, data) {
  if (!userId) return;

  try {
    const rateLimitRef = getAIRateLimitRef(userId);
    await set(rateLimitRef, data);
  } catch (error) {
    console.error("Error saving AI rate limit data:", error);
  }
}
