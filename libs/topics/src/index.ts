export type Topic = string;

export const ALL_TOPICS = "*";

export function normalizeTopic(topic: string | undefined): Topic {
  return topic === undefined || topic === "" ? ALL_TOPICS : topic;
}

export function matchesTopic(announcementTopic: Topic, listenerTopic: Topic): boolean {
  return (
    announcementTopic === ALL_TOPICS ||
    listenerTopic === ALL_TOPICS ||
    announcementTopic === listenerTopic
  );
}
