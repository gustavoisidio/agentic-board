import DOMPurify from 'dompurify';
import { marked } from 'marked';

// Links externos abrem em outra aba, sem acesso à janela de origem.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** Markdown da task -> HTML seguro. HTML cru do arquivo é sanitizado (sem script, handlers, estilos, imagens ou formulários). */
export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false, gfm: true, breaks: false }) as string;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'img', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed', 'svg', 'math'],
    FORBID_ATTR: ['style'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#|\/)/i,
  });
}
