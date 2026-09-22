import { describe, expect, it, vi } from "vitest";
import { isLineNotificationConfigured, notifyLateCheckIn } from "./line-notify";

describe("LINE notifications", () => {
  it("is disabled when LINE credentials are not configured", async () => {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const groupId = process.env.LINE_GROUP_ID;
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    delete process.env.LINE_GROUP_ID;
    expect(isLineNotificationConfigured()).toBe(false);
    await expect(notifyLateCheckIn({ employeeCode: "EMP-001", fullName: "Test" }, "2026-09-22", Date.now(), 5)).resolves.toBe(false);
    if (token) process.env.LINE_CHANNEL_ACCESS_TOKEN = token;
    if (groupId) process.env.LINE_GROUP_ID = groupId;
  });

  it("does not notify for an on-time check-in", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(notifyLateCheckIn({ employeeCode: "EMP-001", fullName: "Test" }, "2026-09-22", Date.now(), 0)).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
