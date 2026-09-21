import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("auth.logout", () => {
  it("reports success for Firebase client sign-out", async () => {
    const ctx = {
      user: null,
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    } satisfies TrpcContext;
    await expect(appRouter.createCaller(ctx).auth.logout()).resolves.toEqual({ success: true });
  });
});
