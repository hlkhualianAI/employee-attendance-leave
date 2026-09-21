import type { App } from "firebase-admin/app";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { gunzipSync } from "node:zlib";

const firebaseTokenKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required Firebase environment variable: ${name}`);
  return value;
}

function getFirebasePrivateKey(): string {
  const compressed = process.env.FIREBASE_PRIVATE_KEY_GZIP_B64;
  if (compressed) {
    return gunzipSync(Buffer.from(compressed, "base64")).toString("utf8");
  }
  const encoded = process.env.FIREBASE_PRIVATE_KEY_B64;
  if (encoded) return Buffer.from(encoded, "base64").toString("utf8");
  return requiredEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
}

async function getFirebaseApp(): Promise<App> {
  const { cert, getApps, initializeApp } = await import("firebase-admin/app");
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  return initializeApp({
    credential: cert({
      projectId: requiredEnv("FIREBASE_PROJECT_ID"),
      clientEmail: requiredEnv("FIREBASE_CLIENT_EMAIL"),
      privateKey: getFirebasePrivateKey(),
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
  const projectId = getFirebaseProjectId();
  const { payload } = await jwtVerify(token, firebaseTokenKeys, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("Firebase ID token has no subject");
  }
  const uid = typeof payload.user_id === "string" ? payload.user_id : payload.sub;
  return {
    uid,
    email: typeof payload.email === "string" ? payload.email : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
  };
}

export function getFirebaseProjectId(): string {
  return requiredEnv("FIREBASE_PROJECT_ID");
}
