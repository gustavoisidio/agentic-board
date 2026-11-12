// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renderiza títulos, listas, código, tabelas e links', () => {
    const html = renderMarkdown('# T\n\n- a\n- b\n\n`x` e\n\n```\ncodigo\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n[site](https://exemplo.com)');
    expect(html).toContain('<h1>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<pre><code>');
    expect(html).toContain('<table>');
    expect(html).toContain('href="https://exemplo.com"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('remove HTML perigoso: script, handlers, javascript:, iframe, imagem, estilo', () => {
    const html = renderMarkdown('<script>alert(1)</script><img src=x onerror=alert(1)><iframe src="https://x"></iframe>\n\n<p onclick="alert(1)" style="color:red">oi</p>\n\n[ruim](javascript:alert(1))');
    for (const bad of ['<script', 'onerror', 'onclick', '<iframe', '<img', 'style=', 'javascript:']) expect(html).not.toContain(bad);
    expect(html).toContain('oi');
  });
});
