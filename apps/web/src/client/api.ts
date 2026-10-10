const ANNOUNCE_PATH = "/api/v1/announce";
const ANNOUNCEMENT_FAILED = "Announcement failed. Try again.";

export async function sendAnnouncement(message: string): Promise<number> {
  const payload = await postAnnouncement(message);
  const listeners = listenerCount(payload);
  if (listeners === undefined) {
    throw new Error(ANNOUNCEMENT_FAILED);
  }
  return listeners;
}

async function postAnnouncement(message: string): Promise<unknown> {
  try {
    const response = await fetch(ANNOUNCE_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message === "" ? {} : { message }),
    });
    return response.ok ? await response.json() : undefined;
  } catch {
    return undefined;
  }
}

function listenerCount(payload: unknown): number | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  if (!("ok" in payload) || payload.ok !== true) {
    return undefined;
  }
  if (!("listeners" in payload)) {
    return undefined;
  }
  const { listeners } = payload;
  if (typeof listeners !== "number" || !Number.isInteger(listeners) || listeners < 0) {
    return undefined;
  }
  return listeners;
}
