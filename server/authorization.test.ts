import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(role: AuthenticatedUser["role"], id = 7): TrpcContext {
  const now = new Date();
  return {
    user: {
      id,
      openId: `role-test-${id}`,
      email: `${role}@example.com`,
      name: role,
      loginMethod: "test",
      role,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("authorization rules", () => {
  it("does not allow HR or employee accounts to list all users", async () => {
    await expect(appRouter.createCaller(createContext("hr")).users.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(createContext("employee")).users.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not allow an admin to remove their own admin access", async () => {
    const caller = appRouter.createCaller(createContext("admin", 7));
    await expect(caller.users.updateRole({ id: 7, role: "hr" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
