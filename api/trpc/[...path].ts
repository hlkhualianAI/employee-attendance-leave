import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../../server/routers";
import { createContext } from "../../server/_core/context";

export default createExpressMiddleware({
  router: appRouter,
  createContext,
});
