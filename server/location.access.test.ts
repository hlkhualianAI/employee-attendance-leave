import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const now = new Date();
  const user: AuthenticatedUser = {
    id: 1,
    openId: "location-test-admin",
    email: "admin@example.com",
    name: "Location Admin",
    loginMethod: "test",
    role: "admin",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const baseInput = {
  employeeId: 1,
  checkInMode: "office" as const,
  latitude: 16.3974363,
  longitude: 102.8603072,
  deviceId: "test-device-1234567890",
};

describe("attendance location rules", () => {
  it("rejects invalid coordinates before writing attendance", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(caller.attendance.checkIn({ ...baseInput, latitude: 100 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects office check-in outside the configured geofence", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(caller.attendance.checkIn({ ...baseInput, latitude: 16.4, longitude: 102.86 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires a reason for offsite check-in", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(caller.attendance.checkIn({ ...baseInput, checkInMode: "offsite", latitude: 16.4, longitude: 102.86 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
