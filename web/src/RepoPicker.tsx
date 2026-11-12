import { FormEvent, useEffect, useState } from 'react';
import { api, type Recent } from './api';

/** Escolher pasta (Finder, só macOS) ou colar o caminho; opcionalmente lista os recentes. Usado na tela inicial e no chip "+". */
export function RepoPicker({ onOpen, showRecent = false, onCancel }: { onOpen: (path: string) => Promise<void>; showRecent?: boolean; onCancel?: () => void }) {
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [canPick, setCanPick] = useState(false);

  useEffect(() => {
    if (showRecent) api.recent().then(setRecent).catch(() => undefined);
    api.capabilities().then((c) => setCanPick(c.pickFolder)).catch(() => undefined);
  }, [showRecent]);

  async function openPath(value: string) {
    setError('');
    setBusy(true);
    try {
      await onOpen(value);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pick() {
    setError('');
    setBusy(true);
    try {
      const res = await api.pickFolder();
      if (res.path) await onOpen(res.path);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (path.trim()) void openPath(path.trim());
  }

  return (
    <div className="picker">
      {canPick && <button className="primary" onClick={() => void pick()} disabled={busy}>Escolher pasta</button>}
      <form className="paste" onSubmit={submit}>
        <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/caminho/absoluto/do/repositório" aria-label="Caminho do repositório" aria-invalid={!!error} autoFocus={!!onCancel} />
        <button type="submit" disabled={busy || !path.trim()}>Abrir</button>
        {onCancel && <button type="button" onClick={onCancel}>Cancelar</button>}
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {recent.length > 0 && (
        <section className="recent">
          <h2>Repositórios recentes</h2>
          <ul>
            {recent.map((r) => (
              <li key={r.path}>
                <button onClick={() => void openPath(r.path)} disabled={busy}>
                  <strong>{r.name}</strong>
                  <span className="muted mono">{r.path}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
