import { useId, useState, type FormEvent } from "react";

export interface AnnouncePageProps {
  readonly onAnnounce: (message: string) => Promise<number>;
}

type AnnounceOutcome =
  | { readonly kind: "delivered"; readonly listeners: number }
  | { readonly kind: "failed"; readonly message: string };

const FALLBACK_FAILURE = "Announcement failed. Try again.";

export function AnnouncePage({ onAnnounce }: AnnouncePageProps) {
  const messageId = useId();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<AnnounceOutcome | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    setPending(true);
    setOutcome(null);
    try {
      const listeners = await onAnnounce(message);
      setOutcome({ kind: "delivered", listeners });
    } catch (error: unknown) {
      setOutcome({
        kind: "failed",
        message: error instanceof Error ? error.message : FALLBACK_FAILURE,
      });
    } finally {
      setPending(false);
    }
  }

  const failure = outcome?.kind === "failed" ? outcome.message : null;

  return (
    <section className="card card-border bg-base-100">
      <form className="card-body gap-4" onSubmit={handleSubmit}>
        <h1 className="card-title">Announce</h1>
        <div className="flex flex-col gap-2">
          <label className="label" htmlFor={messageId}>
            Message (optional)
          </label>
          <textarea
            id={messageId}
            className="textarea textarea-bordered w-full"
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          Announce
        </button>
        <div role="status" className="text-sm">
          {pending ? "Sending announcement…" : null}
          {outcome?.kind === "delivered"
            ? `Sent to ${outcome.listeners} connected ${outcome.listeners === 1 ? "listener" : "listeners"}.`
            : null}
        </div>
        {failure === null ? null : (
          <div role="alert" className="alert alert-error">
            <span>{failure}</span>
          </div>
        )}
      </form>
    </section>
  );
}
