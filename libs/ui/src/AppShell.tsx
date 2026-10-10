import type { ReactNode } from "react";

export interface AppShellProps {
  readonly navigation: ReactNode;
  readonly children: ReactNode;
}

export function AppShell({ navigation, children }: AppShellProps) {
  return (
    <div className="min-h-dvh bg-base-200">
      <header className="navbar bg-base-100 shadow-sm">
        <div className="navbar-start">
          <span className="px-2 text-lg font-semibold">Announcer</span>
        </div>
        <nav aria-label="Primary" className="navbar-end">
          <div className="tabs tabs-box">{navigation}</div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-md p-4">{children}</main>
    </div>
  );
}
