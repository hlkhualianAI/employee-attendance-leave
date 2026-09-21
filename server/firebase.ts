import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required Firebase environment variable: ${name}`);
  return value;
}

async function getFirebaseApp(): Promise<App> {
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
    firestore = getFirestore(await getFirebaseApp());
  }
  return firestore;
}

export async function getFirebaseAuth(): Promise<Auth> {
  if (!firebaseAuth) {
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
