// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Announcement } from "@announce/messages";
import { ListenPage, type ListenPageProps } from "./ListenPage.tsx";

function renderPage(overrides: Partial<ListenPageProps> = {}) {
  const props: ListenPageProps = {
    topic: "*",
    active: false,
    status: "Idle",
    error: null,
    lastAnnouncement: null,
    onTopicChange: vi.fn(),
    onListen: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };
  render(<ListenPage {...props} />);
  return props;
}

function topicField() {
  return screen.getByLabelText("Topic") as HTMLInputElement;
}

function listenButton() {
  return screen.getByRole("button", { name: "Listen" }) as HTMLButtonElement;
}

describe("ListenPage", () => {
  it("reports topic edits and starts listening from the Listen button", async () => {
    const user = userEvent.setup();
    const props = renderPage({ topic: "" });

    expect(topicField().placeholder).toBe("*");
    await user.type(topicField(), "w");
    expect(props.onTopicChange).toHaveBeenCalledWith("w");

    await user.click(listenButton());
    expect(props.onListen).toHaveBeenCalledTimes(1);
  });

  it("locks topic and Listen while active and offers Stop", async () => {
    const user = userEvent.setup();
    const props = renderPage({ active: true, status: "Listening" });

    expect(topicField().disabled).toBe(true);
    expect(listenButton().disabled).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("Listening");

    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(props.onStop).toHaveBeenCalledTimes(1);
  });

  it("hides Stop while idle", () => {
    renderPage();

    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    expect(listenButton().disabled).toBe(false);
  });

  it("shows an alert when listening fails", () => {
    renderPage({ error: "Unable to enable sound. Press Listen to retry." });

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to enable sound. Press Listen to retry.");
  });

  it("shows the empty state before any announcement arrives", () => {
    renderPage();

    expect(screen.getByText("No announcements yet.")).toBeInTheDocument();
  });

  it("shows the latest topic and message as text", () => {
    const announcement: Announcement = { topic: "work", message: "<b>desk</b>" };
    renderPage({ lastAnnouncement: announcement });

    expect(screen.getByText("work")).toBeInTheDocument();
    expect(screen.getByText("<b>desk</b>")).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
  });

  it("marks an empty message as sound only", () => {
    renderPage({ lastAnnouncement: { topic: "*", message: "" } });

    expect(screen.getByText("Sound only (no message)")).toBeInTheDocument();
  });
});
