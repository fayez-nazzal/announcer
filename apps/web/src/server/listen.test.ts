import { describe, expect, it } from "vitest";
import type { WSContext } from "hono/ws";
import { InMemoryAnnouncementDelivery } from "./delivery.ts";
import { createListenerEvents } from "./listen.ts";

type Close = { code: number; reason: string };

function rawSocket(send: (frame: string) => number = () => 1) {
  const sent: string[] = [];
  const closes: Close[] = [];
  const socket = {
    readyState: 1,
    send(frame: string) {
      sent.push(frame);
      return send(frame);
    },
    close(code: number, reason: string) {
      closes.push({ code, reason });
      socket.readyState = 3;
    },
  };
  return { socket, sent, closes };
}

function connect(topic: string, delivery: InMemoryAnnouncementDelivery, socket: unknown) {
  const events = createListenerEvents(topic, delivery);
  const ws = { raw: socket } as unknown as WSContext<undefined>;
  events.onOpen?.(new Event("open"), ws);
  return {
    message(data: unknown) {
      events.onMessage?.({ data } as MessageEvent, ws);
    },
    close() {
      events.onClose?.({} as CloseEvent, ws);
    },
  };
}

const announcement = { topic: "work", message: "desk" };

describe("createListenerEvents", () => {
  it("delivers announcements through the live raw socket", () => {
    const delivery = new InMemoryAnnouncementDelivery();
    const { socket, sent } = rawSocket();
    connect("work", delivery, socket);

    expect(delivery.publish(announcement)).toBe(1);
    expect(sent).toEqual([JSON.stringify(announcement)]);
  });

  it("counts queued and backpressured raw sends as delivered", () => {
    const delivery = new InMemoryAnnouncementDelivery();
    const { socket } = rawSocket(() => -1);
    connect("*", delivery, socket);

    expect(delivery.publish(announcement)).toBe(1);
  });

  it("treats a dropped raw send as a failed delivery and closes the socket", () => {
    const delivery = new InMemoryAnnouncementDelivery();
    const { socket, closes } = rawSocket(() => 0);
    connect("*", delivery, socket);

    expect(delivery.publish(announcement)).toBe(0);
    expect(closes).toEqual([{ code: 1011, reason: "Delivery failed" }]);
  });

  it("ignores sockets whose live readyState is no longer open", () => {
    const delivery = new InMemoryAnnouncementDelivery();
    const { socket, sent } = rawSocket();
    connect("*", delivery, socket);
    socket.readyState = 3;

    expect(delivery.publish(announcement)).toBe(0);
    expect(sent).toEqual([]);
  });

  it("answers ping with pong without producing an announcement", () => {
    const delivery = new InMemoryAnnouncementDelivery();
    const { socket, sent } = rawSocket();
    const listener = connect("*", delivery, socket);

    listener.message("ping");

    expect(sent).toEqual(["pong"]);
    expect(delivery.publish(announcement)).toBe(1);
    expect(sent).toEqual(["pong", JSON.stringify(announcement)]);
  });

  it("removes and closes the listener when pong cannot be sent", () => {
    const delivery = new InMemoryAnnouncementDelivery();
    const { socket, closes } = rawSocket(() => 0);
    const listener = connect("*", delivery, socket);

    listener.message("ping");

    expect(closes).toEqual([{ code: 1011, reason: "Delivery failed" }]);
    expect(delivery.publish(announcement)).toBe(0);
  });

  it("closes the listener for unsupported text and never delivers to it again", () => {
    const delivery = new InMemoryAnnouncementDelivery();
    const { socket, closes } = rawSocket();
    const listener = connect("*", delivery, socket);

    listener.message("hello");

    expect(closes).toEqual([{ code: 1008, reason: "Unsupported listener message" }]);
    expect(delivery.publish(announcement)).toBe(0);
  });

  it("closes the listener for binary client data", () => {
    const delivery = new InMemoryAnnouncementDelivery();
    const { socket, closes } = rawSocket();
    const listener = connect("*", delivery, socket);

    listener.message(new ArrayBuffer(2));

    expect(closes).toEqual([{ code: 1008, reason: "Unsupported listener message" }]);
  });

  it("tolerates an unsupported message when the socket close itself throws", () => {
    const delivery = new InMemoryAnnouncementDelivery();
    const { socket } = rawSocket();
    socket.close = () => {
      throw new Error("already closed");
    };
    const listener = connect("*", delivery, socket);

    expect(() => listener.message("hello")).not.toThrow();
  });

  it("ignores a ping that arrives before the socket is open", () => {
    const delivery = new InMemoryAnnouncementDelivery();
    const events = createListenerEvents("*", delivery);
    const ws = { raw: rawSocket().socket } as unknown as WSContext<undefined>;

    expect(() => events.onMessage?.({ data: "ping" } as MessageEvent, ws)).not.toThrow();
  });

  it("stops receiving announcements after close", () => {
    const delivery = new InMemoryAnnouncementDelivery();
    const { socket, sent } = rawSocket();
    const listener = connect("*", delivery, socket);

    listener.close();

    expect(delivery.publish(announcement)).toBe(0);
    expect(sent).toEqual([]);
  });
});
