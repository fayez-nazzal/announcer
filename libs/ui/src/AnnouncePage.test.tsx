// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnnouncePage } from "./AnnouncePage.tsx";

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function announceButton() {
  return screen.getByRole("button", { name: "Announce" }) as HTMLButtonElement;
}

describe("AnnouncePage", () => {
  it("offers no topic field", () => {
    render(<AnnouncePage onAnnounce={vi.fn(() => Promise.resolve(0))} />);

    expect(screen.queryByLabelText(/topic/i)).toBeNull();
  });

  it("announces an empty message and reports the connected listener count", async () => {
    const user = userEvent.setup();
    const onAnnounce = vi.fn((_message: string) => Promise.resolve(2));
    render(<AnnouncePage onAnnounce={onAnnounce} />);

    await user.click(announceButton());

    expect(onAnnounce).toHaveBeenCalledWith("");
    expect(await screen.findByRole("status")).toHaveTextContent("Sent to 2 connected listeners.");
  });

  it("uses singular wording when exactly one listener is connected", async () => {
    const user = userEvent.setup();
    render(<AnnouncePage onAnnounce={() => Promise.resolve(1)} />);

    await user.click(announceButton());

    expect(await screen.findByRole("status")).toHaveTextContent("Sent to 1 connected listener.");
  });

  it("keeps the entered message after a successful announcement", async () => {
    const user = userEvent.setup();
    const onAnnounce = vi.fn((_message: string) => Promise.resolve(0));
    render(<AnnouncePage onAnnounce={onAnnounce} />);
    const field = screen.getByLabelText("Message (optional)") as HTMLTextAreaElement;

    await user.type(field, "desk");
    await user.click(announceButton());

    expect(onAnnounce).toHaveBeenCalledWith("desk");
    expect(await screen.findByRole("status")).toHaveTextContent("Sent to 0 connected listeners.");
    expect(announceButton().disabled).toBe(false);
    expect(field.value).toBe("desk");
  });

  it("disables duplicate submission while the request is pending", async () => {
    const user = userEvent.setup();
    const pending = deferred<number>();
    const onAnnounce = vi.fn((_message: string) => pending.promise);
    render(<AnnouncePage onAnnounce={onAnnounce} />);

    await user.click(announceButton());

    expect(announceButton().disabled).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("Sending announcement…");
    await user.click(announceButton());
    expect(onAnnounce).toHaveBeenCalledTimes(1);

    pending.resolve(1);
    await waitFor(() => expect(announceButton().disabled).toBe(false));
  });

  it("shows a recoverable alert when the announcement fails and keeps the message", async () => {
    const user = userEvent.setup();
    const onAnnounce = vi.fn((_message: string) => Promise.reject(new Error("Announcement failed. Try again.")));
    render(<AnnouncePage onAnnounce={onAnnounce} />);
    const field = screen.getByLabelText("Message (optional)") as HTMLTextAreaElement;
    await user.type(field, "retry me");

    await user.click(announceButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Announcement failed. Try again.");
    expect(announceButton().disabled).toBe(false);
    expect(field.value).toBe("retry me");
  });

  it("shows a fallback alert when the rejection is not an Error", async () => {
    const user = userEvent.setup();
    render(<AnnouncePage onAnnounce={() => Promise.reject("offline")} />);

    await user.click(announceButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Announcement failed. Try again.");
  });
});
