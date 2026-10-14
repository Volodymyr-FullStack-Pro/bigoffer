/** Shown at once while a page of the app loads on the server (feed, board…): the click is answered immediately. */
export default function Loading() {
  return (
    <div data-testid="page-loading" aria-busy="true" className="flex animate-pulse flex-col gap-6">
      <div className="h-10 w-56 rounded-lg bg-muted" />
      <div className="h-24 rounded-2xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-64 rounded-2xl bg-muted" />
        <div className="h-64 rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
