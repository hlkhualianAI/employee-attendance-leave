import { describe, expect, it } from "vitest";
import { getFirebaseProjectId, getFirestoreDb } from "./firebase";

const hasFirebaseEnv = Boolean(
  process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
);

describe.skipIf(!hasFirebaseEnv)("Firebase Firestore connector", () => {
  it("initializes the Admin SDK and can reach the configured Firestore database", async () => {
    expect(getFirebaseProjectId()).toBeTruthy();
    const db = await getFirestoreDb();
    expect(await getFirestoreDb()).toBe(db);

    const collections = await db.listCollections();
    expect(Array.isArray(collections)).toBe(true);
  }, 30_000);
});
