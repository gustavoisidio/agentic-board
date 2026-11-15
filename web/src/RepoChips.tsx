import { useState } from 'react';
import { PALETTE, type Repo } from './api';
import { RepoPicker } from './RepoPicker';

interface Props {
  repos: Repo[];
  selected: string[]; // vazia = nenhum selecionado = todos os repos aparecem
  onToggle: (repoId: string) => void;
  onShowAll: () => void;
  onAdd: (path: string) => Promise<void>;
  onRemove: (repoId: string) => void;
  onColor: (repoId: string, color: string) => void;
}

export const repoColorVar = (color: string) => `var(--repo-${color})`;

/** Barra de chips: um por repo (ponto de cor, nome, contador, remover); clicar seleciona e o "+" para abrir outro. */
export function RepoChips({ repos, selected, onToggle, onShowAll, onAdd, onRemove, onColor }: Props) {
  const [palette, setPalette] = useState<string | null>(null); // repoId com o seletor de cor aberto
  const [adding, setAdding] = useState(false);
  const filtered = selected.length > 0;

  return (
    <div className="chips" role="group" aria-label="Repositórios">
      {repos.map((repo) => {
        const on = selected.includes(repo.repoId);
        return (
          <div key={repo.repoId} className={`chip${on ? ' on' : filtered ? ' off' : ''}${repo.available ? '' : ' gone'}`}>
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
              aria-pressed={on}
              title={`${repo.path}${repo.available ? '' : ' (indisponível)'}`}
              onClick={() => onToggle(repo.repoId)}
            >
              <span className="chip-name">{repo.name}</span>
              <span className="chip-n">{repo.count}</span>
              {!repo.available && <span className="chip-gone">indisponível</span>}
            </button>
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
      {filtered && <button type="button" className="chip-all" onClick={() => { onShowAll(); }}>Todos</button>}
      <div className="chip-add">
        <button type="button" className="chip plus" aria-label="Abrir outro repositório" aria-expanded={adding} onClick={() => setAdding(!adding)}>+</button>
        {adding && (
          <div className="popover">
            <RepoPicker onCancel={() => setAdding(false)} onOpen={async (path) => { await onAdd(path); setAdding(false); }} />
          </div>
        )}
      </div>
    </div>
  );
}
