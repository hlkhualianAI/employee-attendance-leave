import type { Request, Response } from "express";

type WebhookEvent = {
  type?: string;
  source?: {
    type?: string;
    groupId?: string;
  };
};

type WebhookBody = {
  events?: WebhookEvent[];
};

export default function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    res.status(200).json({ ok: true, message: "LINE webhook endpoint is ready" });
    return;
  }

  const body = (req.body ?? {}) as WebhookBody;
  const groupIds = Array.from(
    new Set(
      (body.events ?? [])
        .map(event => event.source?.groupId)
        .filter((groupId): groupId is string => Boolean(groupId))
    )
  );

  for (const event of body.events ?? []) {
    if (event.source?.groupId) {
      console.log(`[LINE] groupId=${event.source.groupId} event=${event.type ?? "unknown"}`);
    }
  }

  res.status(200).json({ ok: true, groupIds });
}
