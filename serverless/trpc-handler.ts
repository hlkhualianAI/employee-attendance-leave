import type { Request, Response } from "express";
import middleware from "./trpc";

export default function handler(req: Request, res: Response) {
  const procedure = typeof req.query.procedure === "string" ? req.query.procedure : "";
  if (!procedure) {
    res.status(400).json({ error: "Missing tRPC procedure path" });
    return;
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === "procedure") continue;
    if (Array.isArray(value)) {
      value.forEach(item => query.append(key, item));
    } else if (typeof value === "string") {
      query.set(key, value);
    }
  }

  req.url = `/${procedure}${query.size ? `?${query.toString()}` : ""}`;
  return middleware(req, res, () => undefined);
}
