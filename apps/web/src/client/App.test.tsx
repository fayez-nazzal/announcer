// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.tsx";
import { type BrowserDoubles, stubBrowser } from "./test-doubles.ts";

let browser: BrowserDoubles;

function visit(path: string) {
  window.history.pushState({}, "", path);
}

// Clicks Listen, waits for the socket, and completes the handshake.
async function connect(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Listen" }));
  await waitFor(() => expect(browser.sockets).toHaveLength(1));
  act(() => browser.sockets[0]?.open());
}

beforeEach(() => {
  browser = stubBrowser();
  visit("/");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App routing", () => {
  it("redirects the root path to the Listen page", () => {
    render(<App />);

    expect(window.location.pathname).toBe("/listen");
    expect(screen.getByRole("heading", { name: "Listen" })).toBeInTheDocument();
  });

  it("navigating to Announce and back keeps the listener connected", async () => {
    const user = userEvent.setup();
    visit("/listen");
    render(<App />);
    await connect(user);

    await user.click(screen.getByRole("link", { name: "Announce" }));
    expect(screen.getByRole("heading", { name: "Announce" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Listen" }));
    expect(screen.getByRole("status")).toHaveTextContent("Listening");
    expect(browser.sockets).toHaveLength(1);
    expect(browser.sockets[0]?.closeCalls).toBe(0);
  });
});

describe("Listen page", () => {
  it("connects to the typed topic and disconnects on Stop", async () => {
    const user = userEvent.setup();
    visit("/listen");
    render(<App />);

    const topic = screen.getByLabelText("Topic");
    await user.clear(topic);
    await user.type(topic, "desk");
    await connect(user);

    expect(new URL(browser.sockets[0]?.url ?? "").searchParams.get("topic")).toBe("desk");
    expect(screen.getByRole("status")).toHaveTextContent("Listening");

    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(browser.sockets[0]?.closeCalls).toBe(1);
    expect(screen.getByRole("status")).toHaveTextContent("Not listening.");
  });

  it("shows the latest announcement and plays it", async () => {
    const user = userEvent.setup();
    visit("/listen");
    render(<App />);
    await connect(user);

    act(() => browser.sockets[0]?.receive(JSON.stringify({ topic: "desk", message: "build finished" })));

    expect(screen.getByText("build finished")).toBeInTheDocument();
    expect(browser.contexts[0]?.sources).toHaveLength(1);
  });

  it("a single Strict Mode mount opens one socket when Listen is pressed", async () => {
    const user = userEvent.setup();
    visit("/listen");
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await connect(user);

    expect(browser.sockets).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Listening");
  });
});

describe("Announce page", () => {
  it("posts the message and reports the connected listener count", async () => {
    const user = userEvent.setup();
    browser.fetch.mockResolvedValueOnce(Response.json({ ok: true, listeners: 3 }));
    visit("/announce");
    render(<App />);

    await user.type(screen.getByLabelText("Message (optional)"), "hello");
    await user.click(screen.getByRole("button", { name: "Announce" }));

    expect(await screen.findByText("Sent to 3 connected listeners.")).toBeInTheDocument();
    expect(browser.fetch).toHaveBeenCalledWith(
      "/api/v1/announce",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ message: "hello" }) }),
    );
  });

  it("shows an alert when the server rejects the announcement", async () => {
    const user = userEvent.setup();
    browser.fetch.mockResolvedValueOnce(new Response("", { status: 503 }));
    visit("/announce");
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Announce" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Announcement failed. Try again.");
  });
});
