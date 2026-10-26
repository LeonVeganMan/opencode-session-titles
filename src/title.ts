export interface Config {
  /** Rename after this many assistant replies. */
  every: number
  /** Also rename on the first reply, so the session is never left on a placeholder. */
  first: boolean
  /** Hard cap for the generated title. */
  maxLength: number
  /** Language for the generated title: a code (en, it) or a name. */
  language: string
}

export const DEFAULTS: Config = { every: 10, first: true, maxLength: 40, language: "en" }

export function parseConfig(raw: unknown): Config {
  const value = (raw ?? {}) as Partial<Config>
  const every = Number.isFinite(value.every) && (value.every as number) > 0 ? Math.floor(value.every as number) : DEFAULTS.every
  const maxLength =
    Number.isFinite(value.maxLength) && (value.maxLength as number) > 0 ? Math.floor(value.maxLength as number) : DEFAULTS.maxLength
  return {
    every,
    first: typeof value.first === "boolean" ? value.first : DEFAULTS.first,
    maxLength,
    language:
      typeof value.language === "string" && value.language.trim() ? value.language.trim() : DEFAULTS.language,
  }
}

export function due(count: number, config: Config): boolean {
  if (count <= 0) return false
  if (config.first && count === 1) return true
  return count % config.every === 0
}

/** Models like to decorate the answer; keep only the title itself. */
export function cleanTitle(text: string, maxLength: number): string {
  return text
    .replace(/^\s*title\s*:\s*/i, "")
    .replace(/^["'`\s]+|["'`\s]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.;,]+$/, "")
    .trim()
    .slice(0, maxLength)
    .trim()
}
