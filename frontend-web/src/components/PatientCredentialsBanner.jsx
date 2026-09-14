export default function PatientCredentialsBanner({ email, password, onDismiss, title = 'Login credentials (shown once)' }) {
  if (!email || !password) return null;

  const copy = async () => {
    const text = `BreathDx patient login\nEmail: ${email}\nPassword: ${password}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback ignored
    }
  };

  return (
    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-emerald-300 text-sm font-semibold">{title}</p>
          <p className="text-white/40 text-xs mt-1">
            Copy and share with the patient. The password cannot be viewed again after you close this.
          </p>
        </div>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="text-white/30 hover:text-white text-lg leading-none" aria-label="Dismiss">
            ×
          </button>
        )}
      </div>
      <div className="mt-4 grid sm:grid-cols-2 gap-3">
        <div className="bg-black/20 rounded-xl px-4 py-3">
          <p className="text-white/40 text-xs uppercase tracking-wider">Email</p>
          <p className="text-white font-mono text-sm mt-1 break-all">{email}</p>
        </div>
        <div className="bg-black/20 rounded-xl px-4 py-3">
          <p className="text-white/40 text-xs uppercase tracking-wider">Password</p>
          <p className="text-white font-mono text-sm mt-1">{password}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={copy}
        className="mt-4 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
      >
        Copy credentials
      </button>
    </div>
  );
}
