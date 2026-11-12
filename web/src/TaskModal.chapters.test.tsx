// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Task } from './api';
import { TaskModal } from './TaskModal';

const task: Task = { id: 'T-1', title: 'Cap', status: 'Backlog', file: 'specs/tasks/a.md', column: 'backlog', enteredAt: null, rev: '1' };
const columns = [{ key: 'backlog', name: 'Backlog', count: 1 }];
const BODY = 'Contexto sempre visível\n\n## 1. Objetivo\ntexto obj\n\n## 2. Plano\nabertura\n\n### 2.1 Passo\npasso um\n\n```\n## no código\n```\n';

function mockBody(body: string) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...task, body, extra: {} }), { status: 200 })));
}
const ui = (t: Task) => <TaskModal task={t} columns={columns} onMove={() => undefined} onClose={() => undefined} returnFocus={null} />;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('capítulos recolhíveis', () => {
  it('abre tudo recolhido: abertura visível, só a lista de títulos', async () => {
    mockBody(BODY);
    render(ui(task));
    expect(await screen.findByText('Contexto sempre visível')).toBeTruthy();
    const buttons = screen.getAllByRole('button', { expanded: false });
    expect(buttons.map((b) => b.textContent?.replace(/^[▸▾]/, ''))).toEqual(['1. Objetivo', '2. Plano']);
    expect(screen.queryByRole('button', { name: /2\.1 Passo/ })).toBeNull(); // subcapítulos só aparecem dentro do capítulo aberto
    expect(screen.queryByText('texto obj')).toBeNull();
    expect(screen.getByRole('button', { name: /Expandir tudo/ })).toBeTruthy();
  });

  it('clicar abre só aquele capítulo, sem abrir os subcapítulos; clicar de novo fecha', async () => {
    mockBody(BODY);
    render(ui(task));
    const plano = await screen.findByRole('button', { name: /2\. Plano/ });
    expect(plano.getAttribute('aria-controls')).toBeTruthy();
    fireEvent.click(plano);
    expect(plano.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('abertura')).toBeTruthy();
    expect(screen.getByRole('button', { name: /2\.1 Passo/ }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('passo um')).toBeNull();
    fireEvent.click(plano);
    expect(plano.getAttribute('aria-expanded')).toBe('false');
  });

  it('Expandir tudo / Recolher tudo', async () => {
    mockBody(BODY);
    render(ui(task));
    fireEvent.click(await screen.findByRole('button', { name: 'Expandir tudo' }));
    expect(screen.getByText('passo um')).toBeTruthy();
    expect(screen.getByText('texto obj')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Recolher tudo' }));
    expect(screen.queryByText('passo um')).toBeNull();
  });

  it('task sem ## abre normalmente, sem capítulos nem botão de expandir', async () => {
    mockBody('# Título\n\ncorpo simples');
    render(ui(task));
    expect(await screen.findByText('corpo simples')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Expandir tudo/ })).toBeNull();
  });

  it('atualização por fora mantém abertos os capítulos que continuam e recolhe os que sumiram', async () => {
    mockBody(BODY);
    const { rerender } = render(ui(task));
    fireEvent.click(await screen.findByRole('button', { name: /1\. Objetivo/ }));
    fireEvent.click(screen.getByRole('button', { name: /2\. Plano/ }));
    expect(screen.getByText('texto obj')).toBeTruthy();

    mockBody(BODY.replace('texto obj', 'objetivo novo').replace('## 2. Plano', '## 2. Plano B'));
    rerender(ui({ ...task, rev: '2' }));
    await screen.findByText('objetivo novo');
    expect(screen.getByRole('button', { name: /1\. Objetivo/ }).getAttribute('aria-expanded')).toBe('true');
    await waitFor(() => expect(screen.getByRole('button', { name: /2\. Plano B/ }).getAttribute('aria-expanded')).toBe('false'));
  });

  it('Enter e Espaço alternam (botão nativo) e a sanitização continua valendo', async () => {
    mockBody('## X\n<script>alert(1)</script><b>ok</b>');
    const { container } = render(ui(task));
    const x = await screen.findByRole('button', { name: /X/ });
    fireEvent.click(x); // jsdom dispara click para Enter/Espaço em <button>
    expect(await screen.findByText('ok')).toBeTruthy();
    expect(container.innerHTML).not.toContain('<script');
  });
});
