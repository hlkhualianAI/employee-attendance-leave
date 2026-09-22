import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const HASH_ALGORITHM = "sha256";
const SALT_BYTES = 16;

export function hashPin(pin: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = createHash(HASH_ALGORITHM).update(salt).update(pin).digest("hex");
  return `${salt.toString("hex")}:${hash}`;
}

export function verifyPin(pin: string, encodedHash: string | null | undefined): boolean {
  if (!encodedHash) return false;
  const [saltHex, expectedHex] = encodedHash.split(":");
  if (!saltHex || !expectedHex || !/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(expectedHex)) {
    return false;
  }
  const actual = createHash(HASH_ALGORITHM)
    .update(Buffer.from(saltHex, "hex"))
    .update(pin)
    .digest();
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

type SessionPayload = { userId: number; exp: number };

function sessionSignature(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createSessionToken(userId: number, secret: string, ttlSeconds = 60 * 60 * 24 * 7) {
  const payload = Buffer.from(JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  return `${payload}.${sessionSignature(payload, secret)}`;
}

export function readSessionUserId(token: string | undefined, secret: string): number | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || sessionSignature(payload, secret) !== signature) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    return parsed.exp > Math.floor(Date.now() / 1000) && Number.isInteger(parsed.userId) ? parsed.userId : null;
  } catch {
    return null;
  }
}
