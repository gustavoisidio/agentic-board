import { FormEvent, useEffect, useRef, useState } from 'react';
import { COLUMN_DRAG_TYPE, moveBy, moveColumn, type Side } from './columnOrder';
import { isDoneColumn } from './doneColumn';
import { TaskModal } from './TaskModal';
import { api, ApiError, type BoardState, type Column as ColumnT, type Task } from './api';

interface Props {
  board: BoardState;
  unavailable: boolean;
  onLeave: () => void;
  onMove: (id: string, columnKey: string, columnName: string) => void;
  onApply: (state: BoardState) => void;
  onReorder: (keys: string[]) => void;
  notify: (message: string) => void;
}

export function Board({ board, unavailable, onLeave, onMove, onApply, onReorder, notify }: Props) {
  const [newName, setNewName] = useState('');
  const [newError, setNewError] = useState('');
  const dragId = useRef<string | null>(null);
  const [colDrag, setColDrag] = useState<{ key: string; target: string | null; side: Side } | null>(null);
  const [announce, setAnnounce] = useState('');
  const refocus = useRef<string | null>(null);
  const main = useRef<HTMLElement>(null);
  const keys = board.columns.map((c) => c.key);
  const [openId, setOpenId] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const openTask = openId ? board.tasks.find((t) => t.id === openId) : undefined;

  // task removida por fora enquanto o modal está aberto: fecha com aviso
  useEffect(() => {
    if (openId && !openTask) {
      setOpenId(null);
      notify(`A task ${openId} foi removida.`);
    }
  }, [openId, openTask, notify]);

  async function addColumn(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return setNewError('Informe o nome da coluna');
    try {
      onApply(await api.createColumn(newName));
      setNewName('');
      setNewError('');
    } catch (error) {
      setNewError((error as Error).message);
    }
  }

  async function rename(column: ColumnT, name: string): Promise<string | null> {
    if (!name.trim()) return 'Informe o nome da coluna';
    if (name.trim() === column.name) return null;
    if (column.count > 0 && !window.confirm(`Isso altera o status em ${column.count} ${column.count === 1 ? 'arquivo' : 'arquivos'}. Continuar?`)) return null;
    try {
      const result = await api.renameColumn(column.key, name);
      onApply(result.state);
      if (result.failed.length) {
        notify(`Falhou em ${result.failed.length} arquivo(s): ${result.failed.map((f) => `${f.file} (${f.reason})`).join('; ')}. Alterados: ${result.changed.join(', ') || 'nenhum'}.`);
      }
      return null;
    } catch (error) {
      return error instanceof ApiError ? error.message : 'Não foi possível renomear';
    }
  }

  async function remove(column: ColumnT) {
    try {
      onApply(await api.deleteColumn(column.key));
    } catch (error) {
      notify((error as Error).message);
    }
  }

  function reorderTo(next: string[]) {
    if (next !== keys) onReorder(next);
  }

  // teclado: Alt+seta esquerda/direita move a coluna uma posição e anuncia a nova posição
  function moveWithKeyboard(column: ColumnT, delta: number) {
    const next = moveBy(keys, column.key, delta);
    if (next === keys) return;
    refocus.current = column.key;
    setAnnounce(`Coluna ${column.name} movida para a posição ${next.indexOf(column.key) + 1} de ${next.length}`);
    onReorder(next);
  }

  useEffect(() => {
    if (!refocus.current) return;
    document.querySelector<HTMLElement>(`[data-grip="${CSS.escape(refocus.current)}"]`)?.focus();
    refocus.current = null;
  });

  // rolagem horizontal automática perto das bordas durante qualquer arrasto
  function autoScroll(e: React.DragEvent) {
    const el = main.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const edge = 70;
    if (e.clientX < rect.left + edge) el.scrollLeft -= 18;
    else if (e.clientX > rect.right - edge) el.scrollLeft += 18;
  }

  const tasksBy = (key: string) => board.tasks.filter((t) => t.column === key);

  return (
    <div className="app">
      <header>
        <h1>Agentic Board</h1>
        <span className="repo mono" title={board.repo.path}>{board.repo.path}</span>
        <span className="count">{board.tasks.length} {board.tasks.length === 1 ? 'task' : 'tasks'} · {board.columns.length} {board.columns.length === 1 ? 'coluna' : 'colunas'}</span>
        <span className="spacer" />
        <form className="new-col" onSubmit={(e) => void addColumn(e)}>
          <input value={newName} onChange={(e) => { setNewName(e.target.value); setNewError(''); }} placeholder="+ Nova coluna (Enter)" aria-label="Nova coluna" aria-invalid={!!newError} />
          {newError && <span className="error small" role="alert">{newError}</span>}
        </form>
        <button onClick={onLeave}>Trocar repositório…</button>
      </header>

      {unavailable && (
        <div className="banner danger" role="alert">
          Repositório indisponível. <button onClick={onLeave}>Trocar repositório…</button>
        </div>
      )}
      {board.configError && <div className="warn" role="status">{board.configError}</div>}
      <Ignored items={board.ignored} />
      {board.tasks.length === 0 && (
        <div className="warn" role="status">Nenhuma task encontrada em pastas <code>specs</code> ou <code>tasks</code></div>
      )}

      <div className="sr-only" role="status" aria-live="polite">{announce}</div>
      <main className="board" ref={main} onDragOver={autoScroll}>
        {board.columns.map((column) => (
          <ColumnView
            key={column.key}
            column={column}
            tasks={tasksBy(column.key)}
            dimmed={colDrag?.key === column.key}
            indicator={colDrag?.target === column.key && colDrag.key !== column.key ? colDrag.side : null}
            onGripStart={() => setColDrag({ key: column.key, target: null, side: 'after' })}
            onGripEnd={() => setColDrag(null)}
            onColumnOver={(side) => setColDrag((d) => (d && (d.target !== column.key || d.side !== side) ? { ...d, target: column.key, side } : d))}
            onColumnDrop={(side, draggedKey) => {
              setColDrag(null);
              reorderTo(moveColumn(keys, draggedKey, column.key, side));
            }}
            onKeyboardMove={(delta) => moveWithKeyboard(column, delta)}
            onOpen={(id, el) => { opener.current = el; setOpenId(id); }}
            onDragStart={(id) => (dragId.current = id)}
            onDrop={() => {
              const id = dragId.current;
              dragId.current = null;
              const task = board.tasks.find((t) => t.id === id);
              if (task && task.column !== column.key) onMove(task.id, column.key, column.name);
            }}
            onRename={(name) => rename(column, name)}
            onDelete={() => void remove(column)}
          />
        ))}
      </main>
      {openTask && (
        <TaskModal task={openTask} columns={board.columns} onMove={onMove} onClose={() => setOpenId(null)} returnFocus={opener.current} />
      )}
    </div>
  );
}

function Ignored({ items }: { items: { file: string; reason: string }[] }) {
  if (!items.length) return null;
  const summary = items.length === 1
    ? <>1 arquivo ignorado: <code>{items[0]!.file}</code> — {items[0]!.reason}</>
    : <>{items.length} arquivos ignorados</>;
  if (items.length === 1) return <div className="warn" role="status">{summary}</div>;
  return (
    <details className="warn">
      <summary>{summary}</summary>
      <ul>{items.map((i) => <li key={i.file}><code>{i.file}</code> — {i.reason}</li>)}</ul>
    </details>
  );
}

interface ColumnProps {
  column: ColumnT;
  tasks: Task[];
  dimmed: boolean;
  indicator: Side | null;
  onGripStart: () => void;
  onGripEnd: () => void;
  onColumnOver: (side: Side) => void;
  onColumnDrop: (side: Side, draggedKey: string) => void;
  onKeyboardMove: (delta: number) => void;
  onOpen: (id: string, el: HTMLElement) => void;
  onDragStart: (id: string) => void;
  onDrop: () => void;
  onRename: (name: string) => Promise<string | null>;
  onDelete: () => void;
}

function ColumnView({ column, tasks, dimmed, indicator, onGripStart, onGripEnd, onColumnOver, onColumnDrop, onKeyboardMove, onOpen, onDragStart, onDrop, onRename, onDelete }: ColumnProps) {
  const [over, setOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(column.name);
  const [error, setError] = useState('');
  const dragging = useRef(false); // arrastar não abre o modal

  async function commit() {
    const problem = await onRename(name);
    if (problem) return setError(problem);
    setEditing(false);
    setError('');
  }

  return (
    <section
      className={`col${over ? ' over' : ''}${dimmed ? ' col-dragging' : ''}${indicator ? ` ind-${indicator}` : ''}`}
      aria-label={column.name}
      data-done={isDoneColumn(column.name) ? 'true' : undefined}
      onDragOver={(e) => {
        if (isColumnDrag(e)) {
          e.preventDefault(); // só colunas reordenam; o post-it nunca
          onColumnOver(sideOf(e));
          return;
        }
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (isColumnDrag(e)) {
          const draggedKey = e.dataTransfer.getData(COLUMN_DRAG_TYPE);
          if (draggedKey) onColumnDrop(sideOf(e), draggedKey);
          return;
        }
        onDrop();
      }}
    >
      <div className="col-head">
        <button
          type="button"
          className="grip"
          data-grip={column.key}
          draggable
          title="Arraste para reordenar (Alt+setas move pelo teclado)"
          aria-label={`Mover coluna ${column.name}`}
          onDragStart={(e) => {
            e.dataTransfer.setData(COLUMN_DRAG_TYPE, column.key);
            e.dataTransfer.effectAllowed = 'move';
            onGripStart();
          }}
          onDragEnd={onGripEnd}
          onKeyDown={(e) => {
            if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
              e.preventDefault();
              onKeyboardMove(e.key === 'ArrowLeft' ? -1 : 1);
            }
          }}
        >⠿</button>
        {editing ? (
          <input
            autoFocus
            value={name}
            aria-label="Novo nome da coluna"
            aria-invalid={!!error}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commit();
              if (e.key === 'Escape') { setEditing(false); setError(''); }
            }}
            onBlur={() => { if (!error) setEditing(false); }}
          />
        ) : (
          <span className="name">{column.name}</span>
        )}
        <span className="n">{column.count}</span>
        <span className="tools">
          <button title="Renomear" aria-label={`Renomear ${column.name}`} onClick={() => { setName(column.name); setEditing(true); }}>✎</button>
          <button
            title={column.count > 0 ? 'Mova as tasks antes de excluir' : 'Excluir coluna'}
            aria-label={`Excluir ${column.name}`}
            disabled={column.count > 0}
            onClick={onDelete}
          >✕</button>
        </span>
      </div>
      {error && <div className="error small" role="alert">{error}</div>}
      {tasks.map((t) => (
        <article
          key={t.id}
          className="note"
          draggable
          role="button"
          tabIndex={0}
          aria-label={`${t.id}: ${t.title}`}
          onClick={(e) => { if (!dragging.current) onOpen(t.id, e.currentTarget); }}
          onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onOpen(t.id, e.currentTarget); } }}
          onDragStart={(e) => { dragging.current = true; e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(t.id); }}
          onDragEnd={() => setTimeout(() => { dragging.current = false; }, 0)}
          title={t.file}
        >
          <span className="id">{t.id}</span>
          <span className="t">{t.title}</span>
        </article>
      ))}
      {tasks.length === 0 && <div className="empty">Nenhuma task</div>}
    </section>
  );
}

const isColumnDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types ?? []).includes(COLUMN_DRAG_TYPE);

/** Metade esquerda da coluna: insere antes; metade direita: depois. */
function sideOf(e: React.DragEvent): Side {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
}
