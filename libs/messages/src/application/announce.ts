import { normalizeTopic } from "@announce/topics";
import type { Announcement, AnnounceInput } from "../domain/announcement.ts";

export interface AnnouncementDelivery {
  publish(announcement: Announcement): number;
}

export interface AnnounceResult {
  readonly listeners: number;
}

export function announce(input: AnnounceInput, delivery: AnnouncementDelivery): AnnounceResult {
  const announcement: Announcement = Object.freeze({
    topic: normalizeTopic(input.topic),
    message: input.message ?? "",
  });

  return { listeners: delivery.publish(announcement) };
}
