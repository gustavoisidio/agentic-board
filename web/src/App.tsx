import { useCallback, useState } from 'react';
import { Board } from './Board';
import { Home } from './Home';
import { useBoard } from './useBoard';

interface ToastItem { id: number; text: string }

export function App() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const notify = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);
  const state = useBoard(notify);

  return (
    <>
      {state.phase === 'loading' && <Skeleton />}
      {state.phase === 'home' && <Home onOpen={state.addRepo} />}
      {state.phase === 'board' && state.board && (
        <Board
          board={state.board}
          onMove={state.move}
          onReorder={state.reorder}
          onApply={state.apply}
          onToggleRepo={state.toggleRepo}
          onOnlyRepo={state.onlyRepo}
          onShowAll={state.showAll}
          onAddRepo={state.addRepo}
          onRemoveRepo={(id) => void state.removeRepo(id)}
          onColor={(id, color) => void state.setColor(id, color)}
          notify={notify}
        />
      )}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">{t.text}</div>
        ))}
      </div>
    </>
  );
}

function Skeleton() {
  return (
    <main className="board" aria-busy="true" aria-label="Carregando">
      {[0, 1, 2].map((i) => (
        <section key={i} className="col skeleton"><div className="sk sk-head" /><div className="sk sk-note" /><div className="sk sk-note" /></section>
      ))}
    </main>
  );
}
