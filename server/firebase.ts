import type { App } from "firebase-admin/app";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required Firebase environment variable: ${name}`);
  return value;
}

async function getFirebaseApp(): Promise<App> {
  const { cert, getApps, initializeApp } = await import("firebase-admin/app");
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  return initializeApp({
    credential: cert({
      projectId: requiredEnv("FIREBASE_PROJECT_ID"),
      clientEmail: requiredEnv("FIREBASE_CLIENT_EMAIL"),
      privateKey: requiredEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  });
}

let firestore: Firestore | undefined;
let firebaseAuth: Auth | undefined;

/** Returns the shared server-side Firestore client. Never import this from client code. */
export async function getFirestoreDb(): Promise<Firestore> {
  if (!firestore) {
    const { getFirestore } = await import("firebase-admin/firestore");
    firestore = getFirestore(await getFirebaseApp());
  }
  return firestore;
}

export async function getFirebaseAuth(): Promise<Auth> {
  if (!firebaseAuth) {
    const { getAuth } = await import("firebase-admin/auth");
    firebaseAuth = getAuth(await getFirebaseApp());
  }
  return firebaseAuth;
}

export async function verifyFirebaseIdToken(token: string) {
  return (await getFirebaseAuth()).verifyIdToken(token);
}

export function getFirebaseProjectId(): string {
  return requiredEnv("FIREBASE_PROJECT_ID");
}
