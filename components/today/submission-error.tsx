export function SubmissionError({ error, problemId }: { error: string | null; problemId: string }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
    >
      <p>{error}</p>
      {error.startsWith("Your session expired.") ? (
        <a
          className="mt-2 inline-block underline"
          href={`/login?next=${encodeURIComponent(`/today?problemId=${problemId}`)}`}
        >
          Sign in again
        </a>
      ) : null}
    </div>
  );
}
