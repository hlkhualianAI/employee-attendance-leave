import { describe, expect, it } from "vitest";
import { createSessionToken, hashPin, readSessionUserId, verifyPin } from "./local-auth";

describe("local authentication", () => {
  it("hashes and verifies a PIN without storing the plain value", () => {
    const encoded = hashPin("2468");
    expect(encoded).not.toContain("2468");
    expect(verifyPin("2468", encoded)).toBe(true);
    expect(verifyPin("9999", encoded)).toBe(false);
  });

  it("creates and validates an expiring signed session token", () => {
    const token = createSessionToken(42, "test-secret");
    expect(readSessionUserId(token, "test-secret")).toBe(42);
    expect(readSessionUserId(token, "wrong-secret")).toBeNull();
    expect(readSessionUserId(`${token}tampered`, "test-secret")).toBeNull();
  });
});
