import { FormEvent, useEffect, useState } from 'react';
import { api, type Recent } from './api';

export function Home({ onOpen }: { onOpen: (path: string) => Promise<void> }) {
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [canPick, setCanPick] = useState(false);

  useEffect(() => {
    api.recent().then(setRecent).catch(() => undefined);
    api.capabilities().then((c) => setCanPick(c.pickFolder)).catch(() => undefined);
  }, []);

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
    <main className="home">
      <h1>Agentic Board</h1>
      <p className="muted">Escolha o repositório com as tasks (<code>.md</code> em pastas <code>specs</code> ou <code>tasks</code>).</p>
      {canPick && (
        <button className="primary" onClick={() => void pick()} disabled={busy}>Escolher pasta</button>
      )}
      <form className="paste" onSubmit={submit}>
        <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/caminho/absoluto/do/repositório" aria-label="Caminho do repositório" aria-invalid={!!error} />
        <button type="submit" disabled={busy || !path.trim()}>Abrir</button>
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
    </main>
  );
}
