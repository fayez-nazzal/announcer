import { useEffect, useState, useSyncExternalStore } from "react";
import type { Announcement } from "@announce/messages";
import { ListenerController, type ListenerStatus } from "./listener-controller.ts";

export interface UseListener {
  topic: string;
  setTopic: (topic: string) => void;
  start: () => void;
  stop: () => void;
  status: ListenerStatus;
  error: string | null;
  lastAnnouncement: Announcement | null;
}

export function useListener(): UseListener {
  const [controller] = useState(() => new ListenerController());
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [topic, setTopic] = useState("*");

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        controller.reconcile();
      }
    };
    window.addEventListener("pagehide", controller.teardown);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", controller.teardown);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      controller.teardown();
    };
  }, [controller]);

  return {
    topic,
    setTopic,
    start: () => controller.start(topic),
    stop: controller.stop,
    status: state.status,
    error: state.error,
    lastAnnouncement: state.lastAnnouncement,
  };
}
