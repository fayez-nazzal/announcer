import { describe, expect, it } from "vitest";
import { announce, isAnnounceInput, type Announcement, type AnnouncementDelivery } from "./index.ts";

function recordingDelivery(listeners = 0) {
  const published: Announcement[] = [];
  const delivery: AnnouncementDelivery = {
    publish(announcement) {
      published.push(announcement);
      return listeners;
    },
  };
  return { delivery, published };
}

describe("isAnnounceInput", () => {
  it("accepts empty objects and string-only fields", () => {
    expect(isAnnounceInput({})).toBe(true);
    expect(isAnnounceInput({ topic: "work" })).toBe(true);
    expect(isAnnounceInput({ message: "" })).toBe(true);
    expect(isAnnounceInput({ topic: "", message: "hi" })).toBe(true);
  });

  it("rejects null, arrays, scalars and non-string fields", () => {
    expect(isAnnounceInput(null)).toBe(false);
    expect(isAnnounceInput([])).toBe(false);
    expect(isAnnounceInput("hello")).toBe(false);
    expect(isAnnounceInput({ message: null })).toBe(false);
    expect(isAnnounceInput({ topic: 1 })).toBe(false);
  });

  it("rejects extra fields", () => {
    expect(isAnnounceInput({ message: "hello", extra: true })).toBe(false);
  });
});

describe("announce", () => {
  it("publishes the wildcard topic and empty message for an empty input", () => {
    const { delivery, published } = recordingDelivery(3);

    expect(announce({}, delivery)).toEqual({ listeners: 3 });
    expect(published).toEqual([{ topic: "*", message: "" }]);
  });

  it("normalizes an empty topic and preserves the message verbatim", () => {
    const { delivery, published } = recordingDelivery();

    announce({ topic: "", message: "  Hello  " }, delivery);

    expect(published).toEqual([{ topic: "*", message: "  Hello  " }]);
  });

  it("keeps an explicit named topic", () => {
    const { delivery, published } = recordingDelivery();

    announce({ topic: "work", message: "desk" }, delivery);

    expect(published).toEqual([{ topic: "work", message: "desk" }]);
  });

  it("reports zero listeners as a successful result", () => {
    const { delivery } = recordingDelivery(0);

    expect(announce({ message: "nobody" }, delivery)).toEqual({ listeners: 0 });
  });
});
