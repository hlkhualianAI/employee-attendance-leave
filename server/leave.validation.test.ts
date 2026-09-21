import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: 7,
      openId: "leave-validation-test",
      email: "admin@example.com",
      name: "Admin",
      loginMethod: "test",
      role: "admin",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    } satisfies AuthenticatedUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("leave request validation", () => {
  it("rejects a totalDays value that does not match weekdays", async () => {
    const caller = appRouter.createCaller(createContext());

    await expect(
      caller.leave.create({
        employeeId: 1,
        leaveType: "annual",
        startDate: "2026-09-14",
        endDate: "2026-09-18",
        totalDays: 1,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a date range with no working days", async () => {
    const caller = appRouter.createCaller(createContext());

    await expect(
      caller.leave.create({
        employeeId: 1,
        leaveType: "sick",
        startDate: "2026-09-19",
        endDate: "2026-09-20",
        totalDays: 0,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
