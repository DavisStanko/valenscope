// @ts-nocheck
import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKeyEnv = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

function buildPrivateKey() {
  if (!privateKeyEnv) return undefined;
  return privateKeyEnv.replace(/\\n/g, "\n");
}

export function hasAdminCredentials() {
  return Boolean(projectId && clientEmail && buildPrivateKey());
}

function getDatabaseURL() {
  return (
    process.env.FIREBASE_ADMIN_DATABASE_URL ||
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ||
    (projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : undefined)
  );
}

function getAdminApp() {
  if (!getApps().length) {
    if (!hasAdminCredentials()) {
      throw new Error(
        "Firebase Admin credentials are missing. Provide FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY."
      );
    }

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: buildPrivateKey(),
      }),
      databaseURL: getDatabaseURL(),
    });
  }
  return getApp();
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  return getDatabase(getAdminApp());
}
