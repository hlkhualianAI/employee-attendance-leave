import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { parse } from "cookie";
import type { User } from "../../drizzle/schema";
import { getUserById } from "../db";
import { readSessionUserId } from "../local-auth";

export const SESSION_COOKIE = "timekeep_session";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export function getLocalAuthSecret() {
  return process.env.LOCAL_AUTH_SECRET ?? `${process.env.OWNER_EMAIL ?? "songwit.sont@gmail.com"}:timekeep`;
}

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  const token = parse(opts.req.headers.cookie ?? "")[SESSION_COOKIE];
  const userId = readSessionUserId(token, getLocalAuthSecret());
  const user = userId === null ? null : (await getUserById(userId)) ?? null;
  return { req: opts.req, res: opts.res, user };
}
