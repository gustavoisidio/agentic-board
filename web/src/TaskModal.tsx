import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type BoardState, type Task, type TaskDetail } from './api';
import { renderMarkdown } from './markdown';

interface Props {
  task: Task;
  columns: BoardState['columns'];
  onMove: (id: string, columnKey: string, columnName: string) => void;
  onClose: () => void;
  returnFocus: HTMLElement | null;
}

const FOCUSABLE = 'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function formatExtra(value: unknown): string {
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
}

/** Modal somente leitura da task (SPEC modal): cabeçalho, markdown sanitizado, campos extras e troca de status. */
export function TaskModal({ task, columns, onMove, onClose, returnFocus }: Props) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = `task-modal-${task.id}`;

  // carrega o conteúdo e recarrega quando o arquivo muda por fora (rev) ou o status muda
  useEffect(() => {
    let cancelled = false;
    api.task(task.id)
      .then((d) => { if (!cancelled) { setDetail(d); setError(''); } })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [task.id, task.rev, task.status, task.title]);

  const html = useMemo(() => (detail ? renderMarkdown(detail.body) : ''), [detail]);

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
              if (column && column.key !== task.column) onMove(task.id, column.key, column.name);
            }}
          >
            {columns.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
          </select>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        {!detail && !error && <p className="muted">Carregando…</p>}
        {detail && <div className="markdown" data-testid="task-body" dangerouslySetInnerHTML={{ __html: html }} />}
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
