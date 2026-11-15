import { RepoPicker } from './RepoPicker';

export function Home({ onOpen }: { onOpen: (path: string) => Promise<void> }) {
  return (
    <main className="home">
      <h1>Agentic Board</h1>
      <p className="muted">Escolha o repositório com as tasks (<code>.md</code> em pastas <code>specs</code> ou <code>tasks</code>). Depois você pode abrir outros ao lado.</p>
      <RepoPicker onOpen={onOpen} showRecent />
    </main>
  );
}
