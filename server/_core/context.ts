import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId, updateUserRole, upsertUser } from "../db";

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
      const { verifyFirebaseIdToken } = await import("../firebase");
      const decoded = await verifyFirebaseIdToken(authHeader.slice(7));
      const openId = decoded.uid;
      const email = decoded.email ?? null;
      const role = email?.toLowerCase() === primaryAdminEmail ? "admin" : "employee";

      // Firebase authentication is authoritative. Database synchronization is
      // best-effort so a temporary DB outage does not turn a valid login into
      // an unauthenticated request.
      try {
        user = await getUserByOpenId(openId) ?? null;
        // Firebase Authentication is authoritative for identity fields. Sync
        // on every login so an email added or changed in Firebase is reflected
        // in the current user record immediately.
        await upsertUser({
          openId,
          name: decoded.name ?? email ?? openId,
          email,
          loginMethod: "firebase",
          role: user?.role ?? role,
          lastSignedIn: new Date(),
        });
        user = await getUserByOpenId(openId) ?? null;
        if (user && role === "admin" && user.role !== "admin") {
          await updateUserRole(user.id, "admin");
          user = await getUserByOpenId(openId) ?? user;
        }
      } catch (error) {
        console.warn("[Database] Failed to synchronize Firebase user:", error);
      }

      // Allows first login to render even before the legacy TiDB is available.
      if (!user) {
        const now = new Date();
        user = { id: 0, openId, name: decoded.name ?? email, email, loginMethod: "firebase", role, createdAt: now, updatedAt: now, lastSignedIn: now };
      }
    } catch (error) {
      console.warn("[Firebase Auth] Invalid ID token", error);
    }
  }
  return { req: opts.req, res: opts.res, user };
}
