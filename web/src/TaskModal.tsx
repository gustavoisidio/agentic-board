import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type BoardState, type Repo, type Task, type TaskDetail } from './api';
import { repoColorVar } from './RepoChips';
import { allKeys, splitChapters, type Chapter } from './chapters';
import { renderMarkdown } from './markdown';

interface Props {
  task: Task;
  columns: BoardState['columns'];
  repo?: Repo;
  showRepo?: boolean;
  onMove: (repoId: string, id: string, columnKey: string, columnName: string) => void;
  onClose: () => void;
  returnFocus: HTMLElement | null;
}

const FOCUSABLE = 'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function formatExtra(value: unknown): string {
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
}

/** Modal somente leitura da task (SPEC modal): cabeçalho, markdown sanitizado, campos extras e troca de status. */
export function TaskModal({ task, repo, showRepo = false, columns, onMove, onClose, returnFocus }: Props) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = `task-modal-${task.repoId}-${task.id}`;

  // carrega o conteúdo e recarrega quando o arquivo muda por fora (rev) ou o status muda
  useEffect(() => {
    let cancelled = false;
    api.task(task.repoId, task.id)
      .then((d) => { if (!cancelled) { setDetail(d); setError(''); } })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [task.repoId, task.id, task.rev, task.status, task.title]);

  const parts = useMemo(() => (detail ? splitChapters(detail.body) : null), [detail]);
  const [open, setOpen] = useState<Set<string>>(new Set()); // tudo recolhido ao abrir; sem persistência entre aberturas

  // arquivo mudou por fora: capítulos abertos continuam abertos (posição + texto do título); os que sumiram recolhem
  useEffect(() => {
    if (!parts) return;
    const alive = new Set(allKeys(parts.chapters));
    setOpen((current) => {
      const kept = new Set([...current].filter((k) => alive.has(k)));
      return kept.size === current.size ? current : kept;
    });
  }, [parts]);

  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const everyKey = parts ? allKeys(parts.chapters) : [];
  const allOpen = everyKey.length > 0 && everyKey.every((k) => open.has(k));

  // foco no modal ao abrir e de volta ao card ao fechar
  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => returnFocus?.focus();
  }, [returnFocus]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !dialog.current) return;
    const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  const extras = Object.entries(detail?.extra ?? {});

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialog} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <header className="modal-head">
          <div className="modal-title">
            <span className="id">{task.id}</span>
            {showRepo && repo && (
              <span className="modal-repo" title={repo.path}><span className="dot-static" style={{ background: repoColorVar(repo.color) }} aria-hidden="true" />{repo.name}</span>
            )}
            <h2 id={titleId}>{task.title}</h2>
          </div>
          <button type="button" className="modal-close" aria-label="Fechar" onClick={onClose} data-autofocus>✕</button>
        </header>
        <label className="modal-status">
          Status
          <select
            value={task.column}
            onChange={(e) => {
              const column = columns.find((c) => c.key === e.target.value);
              if (column && column.key !== task.column) onMove(task.repoId, task.id, column.key, column.name);
            }}
          >
            {columns.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
          </select>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        {!detail && !error && <p className="muted">Carregando…</p>}
        {parts && (
          <>
            {parts.intro && <div className="markdown" data-testid="task-intro" dangerouslySetInnerHTML={{ __html: renderMarkdown(parts.intro) }} />}
            {parts.chapters.length > 0 && (
              <>
                <button type="button" className="chapters-toggle" onClick={() => setOpen(allOpen ? new Set() : new Set(everyKey))}>
                  {allOpen ? 'Recolher tudo' : 'Expandir tudo'}
                </button>
                <div className="chapters" data-testid="task-body">
                  {parts.chapters.map((c) => (
                    <ChapterView key={c.key} chapter={c} open={open} onToggle={toggle} idPrefix={titleId} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {extras.length > 0 && (
          <dl className="extras" aria-label="Campos extras">
            {extras.map(([key, value]) => (
              <div key={key}><dt>{key}</dt><dd>{formatExtra(value)}</dd></div>
            ))}
          </dl>
        )}
        <p className="muted small mono">{task.file}</p>
      </div>
    </div>
  );
}

function Section({ id, title, level, open, onToggle, children }: { id: string; title: string; level: 2 | 3; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const Heading = level === 2 ? 'h3' : 'h4';
  return (
    <section className={`chapter chapter-${level}`}>
      <Heading>
        <button type="button" id={`${id}-btn`} aria-expanded={open} aria-controls={`${id}-body`} onClick={onToggle}>
          <span className="chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
          {title}
        </button>
      </Heading>
      <div id={`${id}-body`} role="region" aria-labelledby={`${id}-btn`} hidden={!open}>
        {open && children}
      </div>
    </section>
  );
}

function ChapterView({ chapter, open, onToggle, idPrefix }: { chapter: Chapter; open: Set<string>; onToggle: (key: string) => void; idPrefix: string }) {
  const id = `${idPrefix}-c${chapter.key.split(':')[0]}`;
  return (
    <Section id={id} title={chapter.title} level={2} open={open.has(chapter.key)} onToggle={() => onToggle(chapter.key)}>
      {chapter.body && <div className="markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(chapter.body) }} />}
      {chapter.subs.map((sub, j) => (
        <Section key={sub.key} id={`${id}-s${j}`} title={sub.title} level={3} open={open.has(sub.key)} onToggle={() => onToggle(sub.key)}>
          {sub.body && <div className="markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(sub.body) }} />}
        </Section>
      ))}
    </Section>
  );
}
