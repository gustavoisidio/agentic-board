import { describe, expect, it } from 'vitest';
import { splitChapters } from './chapters';

describe('splitChapters', () => {
  const doc = `# EPC-11 — Estratégia

**Repositórios:** a, b · **Origem:** x

## 1. Objetivo
texto do objetivo

## 2. Especificação
abertura

### 2.1 Regras
regra

### 2.2 Casos
caso

## 3. Plano
passos
`;

  it('divide em capítulos ## e subcapítulos ### e mantém o texto de abertura fora deles', () => {
    const r = splitChapters(doc);
    expect(r.intro).toBe('# EPC-11 — Estratégia\n\n**Repositórios:** a, b · **Origem:** x');
    expect(r.chapters.map((c) => c.title)).toEqual(['1. Objetivo', '2. Especificação', '3. Plano']);
    expect(r.chapters[0]!.body).toBe('texto do objetivo');
    expect(r.chapters[1]!.body).toBe('abertura');
    expect(r.chapters[1]!.subs.map((s) => [s.title, s.body])).toEqual([['2.1 Regras', 'regra'], ['2.2 Casos', 'caso']]);
    expect(r.chapters[2]!.subs).toEqual([]);
  });

  it('título dentro de bloco de código não é capítulo (``` e ~~~)', () => {
    const r = splitChapters('## A\n```md\n## falso\n### falso 2\n```\ndepois\n\n~~~\n## outro falso\n~~~\n## B\n');
    expect(r.chapters.map((c) => c.title)).toEqual(['A', 'B']);
    expect(r.chapters[0]!.body).toContain('## falso');
    expect(r.chapters[0]!.body).toContain('## outro falso');
  });

  it('cerca com mais crases só fecha com igual ou mais', () => {
    const r = splitChapters('## A\n````\n```\n## falso\n```\n````\n## B');
    expect(r.chapters.map((c) => c.title)).toEqual(['A', 'B']);
  });

  it('task sem ## não tem capítulos: tudo é abertura', () => {
    const r = splitChapters('# Só título\n\ntexto\n\n### solto\nmais');
    expect(r.chapters).toEqual([]);
    expect(r.intro).toContain('### solto');
  });

  it('chaves identificam por posição e texto; título com # no fim (C#) e fechamento ATX', () => {
    const r = splitChapters('## Linguagem C#\nx\n## Outro ##\ny');
    expect(r.chapters.map((c) => [c.key, c.title])).toEqual([['0:Linguagem C#', 'Linguagem C#'], ['1:Outro', 'Outro']]);
  });

  it('#### e # dentro de um capítulo ficam no corpo', () => {
    const r = splitChapters('## A\n#### fundo\n# h1\n');
    expect(r.chapters[0]!.body).toBe('#### fundo\n# h1');
  });
});
