// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AppShell } from "./AppShell.tsx";

describe("AppShell", () => {
  it("places navigation in the primary landmark and page content in main", () => {
    render(
      <AppShell navigation={<a href="/listen">Listen</a>}>
        <p>Page body</p>
      </AppShell>,
    );

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("link", { name: "Listen" })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByText("Page body")).toBeInTheDocument();
  });
});
