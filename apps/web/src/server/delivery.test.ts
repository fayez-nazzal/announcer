import { describe, expect, it } from "vitest";
import type { Announcement } from "@announce/messages";
import { InMemoryAnnouncementDelivery, type ListenerConnection } from "./delivery.ts";

function fakeConnection(send: (frame: string) => boolean = () => true) {
  const frames: string[] = [];
  const closes: Array<{ code: number; reason: string }> = [];
  let open = true;
  const connection: ListenerConnection = {
    isOpen: () => open,
    send(frame) {
      frames.push(frame);
      return send(frame);
    },
    close(code, reason) {
      closes.push({ code, reason });
      open = false;
    },
  };
  return {
    connection,
    frames,
    closes,
    disconnect() {
      open = false;
    },
  };
}

const workAnnouncement: Announcement = { topic: "work", message: "desk" };

describe("InMemoryAnnouncementDelivery", () => {
  it("delivers matching announcements as JSON and counts successful sends", () => {
    const delivery = new InMemoryAnnouncementDelivery();
    const work = fakeConnection();
    const wildcard = fakeConnection();
    const other = fakeConnection();
    delivery.listen("work", work.connection);
    delivery.listen("*", wildcard.connection);
    delivery.listen("other", other.connection);

    const delivered = delivery.publish(workAnnouncement);

    expect(delivered).toBe(2);
    expect(work.frames).toEqual([JSON.stringify(workAnnouncement)]);
    expect(wildcard.frames).toEqual([JSON.stringify(workAnnouncement)]);
    expect(other.frames).toEqual([]);
  });

  it("reports zero recipients when nobody listens", () => {
    const delivery = new InMemoryAnnouncementDelivery();

    expect(delivery.publish({ topic: "*", message: "" })).toBe(0);
  });

  it("drops closed connections without attempting delivery", () => {
    const delivery = new InMemoryAnnouncementDelivery();
    const closed = fakeConnection();
    closed.disconnect();
    delivery.listen("*", closed.connection);

    expect(delivery.publish({ topic: "*", message: "" })).toBe(0);
    expect(closed.frames).toEqual([]);
  });

  it("closes a connection whose send fails without blocking healthy peers", () => {
    const delivery = new InMemoryAnnouncementDelivery();
    const failing = fakeConnection(() => false);
    const healthy = fakeConnection();
    delivery.listen("*", failing.connection);
    delivery.listen("*", healthy.connection);

    expect(delivery.publish({ topic: "*", message: "one" })).toBe(1);
    expect(failing.closes).toEqual([{ code: 1011, reason: "Delivery failed" }]);
    expect(healthy.frames).toHaveLength(1);

    delivery.publish({ topic: "*", message: "two" });
    expect(failing.frames).toHaveLength(1);
  });

  it("treats a thrown send as a failed delivery", () => {
    const delivery = new InMemoryAnnouncementDelivery();
    const throwing = fakeConnection(() => {
      throw new Error("socket gone");
    });
    const healthy = fakeConnection();
    delivery.listen("*", throwing.connection);
    delivery.listen("*", healthy.connection);

    expect(delivery.publish({ topic: "*", message: "" })).toBe(1);
    expect(throwing.closes).toEqual([{ code: 1011, reason: "Delivery failed" }]);
    expect(healthy.frames).toHaveLength(1);
  });

  it("keeps delivering when closing a failed connection throws", () => {
    const delivery = new InMemoryAnnouncementDelivery();
    const failing: ListenerConnection = {
      isOpen: () => true,
      send: () => false,
      close: () => {
        throw new Error("already closed");
      },
    };
    const healthy = fakeConnection();
    delivery.listen("*", failing);
    delivery.listen("*", healthy.connection);

    expect(delivery.publish({ topic: "*", message: "" })).toBe(1);
    expect(healthy.frames).toHaveLength(1);
  });

  it("stops delivering after the removal function runs, and removal is idempotent", () => {
    const delivery = new InMemoryAnnouncementDelivery();
    const listener = fakeConnection();
    const stop = delivery.listen("*", listener.connection);

    stop();
    stop();

    expect(delivery.publish({ topic: "*", message: "" })).toBe(0);
    expect(listener.frames).toEqual([]);
  });
});
