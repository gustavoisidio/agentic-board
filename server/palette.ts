/** Paleta fixa de cores por repositório (os tons claro/escuro estão em web/src/styles.css, variáveis --repo-<nome>). */
export const PALETTE = ['azul', 'teal', 'indigo', 'ambar', 'musgo', 'vinho', 'ardosia', 'cobre'] as const;
export type RepoColor = (typeof PALETTE)[number];

export const isColor = (value: unknown): value is RepoColor => PALETTE.includes(value as RepoColor);

/** Primeira cor livre; se todas estiverem em uso, recomeça a paleta. */
export function nextColor(used: string[]): RepoColor {
  return PALETTE.find((c) => !used.includes(c)) ?? PALETTE[used.length % PALETTE.length]!;
}
