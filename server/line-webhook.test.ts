import { describe, expect, it } from "vitest";
import { handleLineWebhook } from "./line-webhook";

describe("LINE webhook", () => {
  it("extracts group IDs from join and message events", () => {
    expect(handleLineWebhook({
      events: [
        { type: "join", source: { type: "group", groupId: "C-group-1" } },
        { type: "message", source: { type: "group", groupId: "C-group-1" } },
      ],
    })).toEqual({ ok: true, groupIds: ["C-group-1"] });
  });

  it("returns success for an empty event payload", () => {
    expect(handleLineWebhook({ events: [] })).toEqual({ ok: true, groupIds: [] });
  });
});
