import { useId } from "react";
import type { Announcement } from "@announce/messages";

export interface ListenPageProps {
  readonly topic: string;
  readonly active: boolean;
  readonly status: string;
  readonly error: string | null;
  readonly lastAnnouncement: Announcement | null;
  readonly onTopicChange: (topic: string) => void;
  readonly onListen: () => void;
  readonly onStop: () => void;
}

export function ListenPage({
  topic,
  active,
  status,
  error,
  lastAnnouncement,
  onTopicChange,
  onListen,
  onStop,
}: ListenPageProps) {
  const topicId = useId();

  return (
    <section className="card card-border bg-base-100">
      <div className="card-body gap-4">
        <h1 className="card-title">Listen</h1>
        <div className="flex flex-col gap-2">
          <label className="label" htmlFor={topicId}>
            Topic
          </label>
          <input
            id={topicId}
            type="text"
            className="input input-bordered w-full"
            placeholder="*"
            value={topic}
            disabled={active}
            onChange={(event) => onTopicChange(event.target.value)}
          />
        </div>
        <div className="card-actions">
          {active ? (
            <button type="button" className="btn btn-outline" onClick={onStop}>
              Stop
            </button>
          ) : null}
          <button type="button" className="btn btn-primary" disabled={active} onClick={onListen}>
            Listen
          </button>
        </div>
        <div role="status" className="text-sm font-medium">
          {status}
        </div>
        {error === null ? null : (
          <div role="alert" className="alert alert-error">
            <span>{error}</span>
          </div>
        )}
        <div className="divider my-0">Latest announcement</div>
        {lastAnnouncement === null ? (
          <p className="text-sm opacity-70">No announcements yet.</p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="font-semibold">Topic</dt>
            <dd>{lastAnnouncement.topic}</dd>
            <dt className="font-semibold">Message</dt>
            <dd>
              {lastAnnouncement.message === "" ? (
                <span className="italic opacity-70">Sound only (no message)</span>
              ) : (
                lastAnnouncement.message
              )}
            </dd>
          </dl>
        )}
      </div>
    </section>
  );
}
