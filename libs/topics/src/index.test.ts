import { describe, expect, it } from "vitest";
import { ALL_TOPICS, matchesTopic, normalizeTopic } from "./index.ts";

describe("normalizeTopic", () => {
  it("maps omitted and empty topics to the wildcard", () => {
    expect(normalizeTopic(undefined)).toBe(ALL_TOPICS);
    expect(normalizeTopic("")).toBe(ALL_TOPICS);
  });

  it("keeps other topics exactly, including case and whitespace", () => {
    expect(normalizeTopic("Work ")).toBe("Work ");
  });
});

describe("matchesTopic", () => {
  it("delivers exact topic matches", () => {
    expect(matchesTopic("work", "work")).toBe(true);
  });

  it("is case-sensitive and does not treat trailing star as a pattern", () => {
    expect(matchesTopic("work", "Work")).toBe(false);
    expect(matchesTopic("work-1", "work*")).toBe(false);
    expect(matchesTopic("work", "work*")).toBe(false);
  });

  it("delivers wildcard announcements to every listener", () => {
    expect(matchesTopic("*", "other")).toBe(true);
  });

  it("delivers any announcement to a wildcard listener", () => {
    expect(matchesTopic("work", "*")).toBe(true);
  });

  it("rejects mismatched named topics", () => {
    expect(matchesTopic("work", "other")).toBe(false);
  });
});
