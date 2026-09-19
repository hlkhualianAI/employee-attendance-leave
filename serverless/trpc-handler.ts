import type { Request, Response } from "express";
import middleware from "./trpc";

export default function handler(req: Request, res: Response) {
  const requestUrl = new URL(req.url ?? "/", "http://vercel.local");
  const requestQuery = req.query ?? {};
  const procedureFromQuery = requestQuery.procedure;
  const procedure =
    typeof procedureFromQuery === "string"
      ? procedureFromQuery
      : requestQuery.procedure instanceof Array
        ? requestQuery.procedure.join("/")
        : requestUrl.searchParams.get("procedure") ??
          requestUrl.pathname.replace(/^\/api\/trpc\/?/, "");
  if (!procedure) {
    res.status(400).json({ error: "Missing tRPC procedure path" });
    return;
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(requestQuery)) {
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
