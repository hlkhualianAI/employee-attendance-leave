type LineWebhookEvent = {
  type?: string;
  source?: {
    type?: string;
    groupId?: string;
    userId?: string;
  };
};

type LineWebhookPayload = {
  events?: LineWebhookEvent[];
};

export function handleLineWebhook(payload: LineWebhookPayload) {
  const groupIds = new Set<string>();
  for (const event of payload.events ?? []) {
    const groupId = event.source?.groupId;
    if (!groupId) continue;
    groupIds.add(groupId);
    console.log(`[LINE] groupId=${groupId} event=${event.type ?? "unknown"}`);
  }
  return { ok: true, groupIds: Array.from(groupIds) };
}
