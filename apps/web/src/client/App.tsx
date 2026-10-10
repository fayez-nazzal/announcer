import { AnnouncePage, AppShell, ListenPage } from "@announce/ui";
import { BrowserRouter, Navigate, NavLink, Route, Routes } from "react-router";
import { sendAnnouncement } from "./api.ts";
import type { ListenerStatus } from "./listener-controller.ts";
import { useListener } from "./use-listener.ts";

const STATUS_LABELS: Record<ListenerStatus, string> = {
  idle: "Not listening.",
  starting: "Enabling sound…",
  listening: "Listening",
  reconnecting: "Reconnecting…",
  error: "Stopped.",
};

const ACTIVE: Record<ListenerStatus, boolean> = {
  idle: false,
  starting: true,
  listening: true,
  reconnecting: true,
  error: false,
};

function tabClass({ isActive }: { isActive: boolean }) {
  return isActive ? "tab tab-active" : "tab";
}

function Navigation() {
  return (
    <nav className="tabs tabs-box">
      <NavLink to="/listen" className={tabClass}>
        Listen
      </NavLink>
      <NavLink to="/announce" className={tabClass}>
        Announce
      </NavLink>
    </nav>
  );
}

export function App() {
  const listener = useListener();

  return (
    <BrowserRouter>
      <AppShell navigation={<Navigation />}>
        <Routes>
          <Route path="/" element={<Navigate to="/listen" replace />} />
          <Route
            path="/listen"
            element={
              <ListenPage
                topic={listener.topic}
                active={ACTIVE[listener.status]}
                status={STATUS_LABELS[listener.status]}
                error={listener.error}
                lastAnnouncement={listener.lastAnnouncement}
                onTopicChange={listener.setTopic}
                onListen={listener.start}
                onStop={listener.stop}
              />
            }
          />
          <Route path="/announce" element={<AnnouncePage onAnnounce={sendAnnouncement} />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
