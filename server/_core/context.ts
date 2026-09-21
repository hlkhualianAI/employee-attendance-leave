import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId, upsertUser } from "../db";
import { verifyFirebaseIdToken } from "../firebase";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

const primaryAdminEmail = (process.env.OWNER_EMAIL ?? "songwit.sont@gmail.com").toLowerCase();

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;
  const authHeader = opts.req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    try {
      const decoded = await verifyFirebaseIdToken(authHeader.slice(7));
      const openId = decoded.uid;
      user = await getUserByOpenId(openId) ?? null;
      if (!user) {
        const email = decoded.email ?? null;
        const role = email?.toLowerCase() === primaryAdminEmail ? "admin" : "employee";
        await upsertUser({
          openId,
          name: decoded.name ?? email ?? openId,
          email,
          loginMethod: "firebase",
          role,
          lastSignedIn: new Date(),
        });
        user = await getUserByOpenId(openId) ?? null;
        // Allows first login to render even before the legacy TiDB is removed.
        if (!user) {
          const now = new Date();
          user = { id: 0, openId, name: decoded.name ?? email, email, loginMethod: "firebase", role, createdAt: now, updatedAt: now, lastSignedIn: now };
        }
      }
    } catch (error) {
      console.warn("[Firebase Auth] Invalid ID token", error);
    }
  }
  return { req: opts.req, res: opts.res, user };
}
