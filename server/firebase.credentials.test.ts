import { describe, expect, it } from "vitest";
import { importPKCS8, SignJWT } from "jose";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/datastore";
const hasFirebaseEnv = Boolean(
  process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
);

describe.skipIf(!hasFirebaseEnv)("Firebase Admin credentials", () => {
  it("can exchange the configured service account for a Google access token", async () => {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const configuredPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
    const privateKey = configuredPrivateKey?.includes("\\n")
      ? configuredPrivateKey.replace(/\\n/g, "\n")
      : configuredPrivateKey;

    expect(projectId, "FIREBASE_PROJECT_ID is required").toBeTruthy();
    expect(clientEmail, "FIREBASE_CLIENT_EMAIL is required").toMatch(
      /@.*\.iam\.gserviceaccount\.com$/
    );
    expect(privateKey, "FIREBASE_PRIVATE_KEY is required").toContain(
      "BEGIN PRIVATE KEY"
    );

    const now = Math.floor(Date.now() / 1000);
    const signingKey = await importPKCS8(privateKey!, "RS256");
    const assertion = await new SignJWT({
      scope: GOOGLE_SCOPE,
      aud: TOKEN_ENDPOINT,
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(clientEmail!)
      .setSubject(clientEmail!)
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(signingKey);

    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });

    const body = (await response.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    expect(
      response.ok,
      `Google token exchange failed for Firebase project ${projectId}: ${body.error ?? "unknown error"} ${body.error_description ?? ""}`
    ).toBe(true);
    expect(body.access_token).toBeTruthy();
  }, 30_000);
});
