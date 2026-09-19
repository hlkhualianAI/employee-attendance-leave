import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../../server/routers.ts";
import { createContext } from "../../server/_core/context.ts";

export default createExpressMiddleware({
  router: appRouter,
  createContext,
});
