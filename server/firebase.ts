import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required Firebase environment variable: ${name}`);
  }
  return value;
}

function getFirebaseApp(): App {
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  const projectId = requiredEnv("FIREBASE_PROJECT_ID");
  const clientEmail = requiredEnv("FIREBASE_CLIENT_EMAIL");
  const privateKey = requiredEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

let firestore: Firestore | undefined;

/** Returns the shared server-side Firestore client. Never import this from client code. */
export function getFirestoreDb(): Firestore {
  firestore ??= getFirestore(getFirebaseApp());
  return firestore;
}

export function getFirebaseProjectId(): string {
  return requiredEnv("FIREBASE_PROJECT_ID");
}
