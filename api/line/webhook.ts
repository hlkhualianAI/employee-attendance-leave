import type { Request, Response } from "express";
import { handleLineWebhook } from "../../server/line-webhook";

export default function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    res.status(200).json({ ok: true, message: "LINE webhook endpoint is ready" });
    return;
  }
  const result = handleLineWebhook(req.body ?? {});
  res.status(200).json(result);
}
