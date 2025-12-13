// @ts-nocheck
"use client";

import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyBpA5e5QPd5AMwScqxnLN7-Y7_BH8kx04Y",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    "valenscope-c3517.firebaseapp.com",
  databaseURL:
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ||
    "https://valenscope-c3517-default-rtdb.firebaseio.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "valenscope-c3517",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "valenscope-c3517.firebasestorage.app",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "741237704172",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    "1:741237704172:web:d678c202a963b4983c2cc9",
  measurementId:
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-R2MEE41GZJ",
};

let appInstance = null;

export function getFirebaseApp() {
  if (typeof window === "undefined") {
    return null;
  }
  if (!appInstance) {
    appInstance = getApps()[0] || initializeApp(firebaseConfig);
  }
  return appInstance;
}

export function getClientAuth() {
  const app = getFirebaseApp();
  if (!app) return null;
  return getAuth(app);
}

export function getClientDb() {
  const app = getFirebaseApp();
  if (!app) return null;
  return getDatabase(app);
}

export function getGoogleProvider() {
  return new GoogleAuthProvider();
}
