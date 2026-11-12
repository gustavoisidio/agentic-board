import { useRef, useState } from 'react';
import { PALETTE, type Repo } from './api';
import { RepoPicker } from './RepoPicker';

interface Props {
  repos: Repo[];
  hidden: string[];
  onToggle: (repoId: string) => boolean;
  onOnly: (repoId: string) => void;
  onShowAll: () => void;
  onAdd: (path: string) => Promise<void>;
  onRemove: (repoId: string) => void;
  onColor: (repoId: string, color: string) => void;
}

export const repoColorVar = (color: string) => `var(--repo-${color})`;

/** Barra de chips: um por repo (ponto de cor, nome, contador, só este, remover) e o "+" para abrir outro. */
export function RepoChips({ repos, hidden, onToggle, onOnly, onShowAll, onAdd, onRemove, onColor }: Props) {
  const [hint, setHint] = useState('');
  const [palette, setPalette] = useState<string | null>(null); // repoId com o seletor de cor aberto
  const [adding, setAdding] = useState(false);
  const clicks = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const filtered = hidden.length > 0;

  function toggle(repo: Repo) {
    if (!onToggle(repo.repoId)) setHint('Mantenha ao menos um repositório visível.');
    else setHint('');
  }

  return (
    <div className="chips" role="group" aria-label="Repositórios">
      {repos.map((repo) => {
        const active = !hidden.includes(repo.repoId);
        return (
          <div key={repo.repoId} className={`chip${active ? '' : ' off'}${repo.available ? '' : ' gone'}`}>
            <button
              type="button"
              className="dot"
              style={{ background: repoColorVar(repo.color) }}
              aria-label={`Trocar a cor de ${repo.name}`}
              aria-expanded={palette === repo.repoId}
              onClick={() => setPalette(palette === repo.repoId ? null : repo.repoId)}
            />
            <button
              type="button"
              className="chip-main"
              aria-pressed={active}
              title={`${repo.path}${repo.available ? '' : ' (indisponível)'}`}
              onClick={() => {
                // duplo clique = só este; o clique simples espera um instante para distinguir
                if (clicks.current?.id === repo.repoId) {
                  clearTimeout(clicks.current.timer);
                  clicks.current = null;
                  onOnly(repo.repoId);
                  setHint('');
                  return;
                }
                if (clicks.current) clearTimeout(clicks.current.timer);
                clicks.current = { id: repo.repoId, timer: setTimeout(() => { clicks.current = null; toggle(repo); }, 220) };
              }}
            >
              <span className="chip-name">{repo.name}</span>
              <span className="chip-n">{repo.count}</span>
              {!repo.available && <span className="chip-gone">indisponível</span>}
            </button>
            <button type="button" className="chip-only" title="Só este" aria-label={`Mostrar só ${repo.name}`} onClick={() => { onOnly(repo.repoId); setHint(''); }}>◉</button>
            <button type="button" className="chip-x" title="Remover do board (nada muda em disco)" aria-label={`Remover ${repo.name} do board`} onClick={() => onRemove(repo.repoId)}>✕</button>
            {palette === repo.repoId && (
              <div className="palette" role="group" aria-label={`Cor de ${repo.name}`}>
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`swatch${repo.color === c ? ' sel' : ''}`}
                    style={{ background: repoColorVar(c) }}
                    aria-label={c}
                    aria-pressed={repo.color === c}
                    onClick={() => { onColor(repo.repoId, c); setPalette(null); }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {filtered && <button type="button" className="chip-all" onClick={() => { onShowAll(); setHint(''); }}>Todos</button>}
      <div className="chip-add">
        <button type="button" className="chip plus" aria-label="Abrir outro repositório" aria-expanded={adding} onClick={() => setAdding(!adding)}>+</button>
        {adding && (
          <div className="popover">
            <RepoPicker onCancel={() => setAdding(false)} onOpen={async (path) => { await onAdd(path); setAdding(false); }} />
          </div>
        )}
      </div>
      <span className="sr-only" role="status" aria-live="polite">{hint}</span>
      {hint && <span className="small muted" aria-hidden="true">{hint}</span>}
    </div>
  );
}
