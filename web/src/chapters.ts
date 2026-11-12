export interface Chapter {
  key: string; // posição + texto do título: identifica o capítulo entre atualizações
  title: string;
  body: string; // markdown antes do primeiro subcapítulo
  subs: { key: string; title: string; body: string }[];
}
export interface SplitBody {
  intro: string; // antes do primeiro "##": sempre visível
  chapters: Chapter[];
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(##|###)[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;

/** Texto simples do título (sem marcação inline) para o botão do capítulo. */
export function plainTitle(raw: string): string {
  return raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim();
}

/**
 * Divide o markdown em capítulos: cada `##` é um capítulo e cada `###` dentro dele, um subcapítulo.
 * Títulos dentro de bloco de código (``` ou ~~~) não contam. `###` antes do primeiro `##` fica no texto de abertura.
 */
export function splitChapters(markdown: string): SplitBody {
  const intro: string[] = [];
  const chapters: { title: string; body: string[]; subs: { title: string; body: string[] }[] }[] = [];
  let target = intro;
  let fence: { char: string; size: number } | null = null;

  for (const line of markdown.split('\n')) {
    const f = FENCE.exec(line);
    if (f) {
      const run = f[1]!;
      if (!fence) fence = { char: run[0]!, size: run.length };
      else if (run[0] === fence.char && run.length >= fence.size && line.trim() === run.trim()) fence = null;
    } else if (!fence) {
      const h = HEADING.exec(line);
      if (h) {
        const level = h[1]!.length;
        const title = plainTitle(h[2]!);
        if (level === 2) {
          const chapter = { title, body: [] as string[], subs: [] };
          chapters.push(chapter);
          target = chapter.body;
          continue;
        }
        const current = chapters[chapters.length - 1];
        if (current) {
          const sub = { title, body: [] as string[] };
          current.subs.push(sub);
          target = sub.body;
          continue;
        }
      }
    }
    target.push(line);
  }

  return {
    intro: intro.join('\n').trim(),
    chapters: chapters.map((c, i) => ({
      key: `${i}:${c.title}`,
      title: c.title,
      body: c.body.join('\n').trim(),
      subs: c.subs.map((s, j) => ({ key: `${i}:${c.title}/${j}:${s.title}`, title: s.title, body: s.body.join('\n').trim() })),
    })),
  };
}

export const allKeys = (chapters: Chapter[]): string[] => chapters.flatMap((c) => [c.key, ...c.subs.map((s) => s.key)]);
