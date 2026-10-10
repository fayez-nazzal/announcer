import type { Topic } from "@announce/topics";

export interface AnnounceInput {
  readonly topic?: string;
  readonly message?: string;
}

export interface Announcement {
  readonly topic: Topic;
  readonly message: string;
}

const ALLOWED_KEYS: Record<"topic" | "message", true> = { topic: true, message: true };

export function isAnnounceInput(value: unknown): value is AnnounceInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(ALLOWED_KEYS, key)) {
      return false;
    }
  }

  const candidate = value as Record<string, unknown>;
  for (const key of Object.keys(ALLOWED_KEYS)) {
    if (key in candidate && typeof candidate[key] !== "string") {
      return false;
    }
  }

  return true;
}
