import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { sendAnnouncement } from "./api.ts";

const FAILED = "Announcement failed. Try again.";

describe("sendAnnouncement", () => {
  let fetchMock: Mock<typeof fetch>;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts a JSON message and resolves with the listener count", async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true, listeners: 3 }));

    await expect(sendAnnouncement("hello")).resolves.toBe(3);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/announce");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({ message: "hello" });
  });

  it("sends an empty object for an empty message", async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true, listeners: 0 }));

    await expect(sendAnnouncement("")).resolves.toBe(0);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({});
  });

  it("rejects without retrying when the network request fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(sendAnnouncement("hello")).rejects.toThrow(FAILED);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects without retrying on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "Service unavailable" }, { status: 503 }));

    await expect(sendAnnouncement("hello")).rejects.toThrow(FAILED);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-JSON success body", async () => {
    fetchMock.mockResolvedValue(new Response("not json", { status: 200 }));

    await expect(sendAnnouncement("hello")).rejects.toThrow(FAILED);
  });

  it.each([
    ["ok is not true", { ok: false, listeners: 1 }],
    ["listeners is missing", { ok: true }],
    ["listeners is a string", { ok: true, listeners: "2" }],
    ["listeners is negative", { ok: true, listeners: -1 }],
    ["listeners is fractional", { ok: true, listeners: 1.5 }],
    ["body is null", null],
  ])("rejects a success body where %s", async (_label, body) => {
    fetchMock.mockResolvedValue(Response.json(body));

    await expect(sendAnnouncement("hello")).rejects.toThrow(FAILED);
  });
});
