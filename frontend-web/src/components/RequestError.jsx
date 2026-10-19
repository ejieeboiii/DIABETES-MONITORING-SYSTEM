export default function RequestError({ message, onRetry, onLogout }) {
  return (
    <div role="alert" className="m-4 rounded-2xl border border-rose-200 bg-white p-5 text-slate-800">
      <p>{message}</p>
      <div className="mt-3 flex gap-3">
        {onRetry && <button type="button" onClick={onRetry} className="rounded-lg bg-sky-600 px-4 py-2 text-white">Retry</button>}
        {onLogout && <button type="button" onClick={onLogout} className="rounded-lg border px-4 py-2">Sign out</button>}
      </div>
    </div>
  );
}
