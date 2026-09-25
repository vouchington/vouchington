export type LongOptionArgument = 'none' | 'optional' | 'required'

export type OptionGrammar = {
  /** Canonical names for short letters, so `-C` and `--chdir` both parse as `chdir`. */
  aliases?: Readonly<Record<string, string>>
  /** Treat a lone `-` as this option (`env -` means `env -i`) instead of an operand. */
  loneDash?: string
  long?: Readonly<Record<string, LongOptionArgument>>
  /** Treat legacy `-N`, `--N`, and `-+N` words as this option (`nice -5` means `nice -n 5`). */
  numeric?: string
  /** Short letters whose argument is optional and must be attached (`xargs -i{}`). */
  shortOptionalArgument?: string
  /** Short letters whose argument is required: attached (`-C/tmp`) or the next word. */
  shortRequiredArgument?: string
  /**
   * Single-dash multi-character long options (BSD `arch`: `-arm64`, `-arch NAME`), tried before a
   * short cluster so `-arm64e` parses as one option rather than letters that can collide with a
   * registered short one (`-e`).
   */
  singleDashLong?: Readonly<Record<string, LongOptionArgument>>
}

export type ParsedOption = { name: string; value: string | undefined }

export type ParsedOptions = { next: number; options: ParsedOption[] }

const NUMERIC_OPTION = /^-[-+]?\d+$/

/**
 * getopt-style parse of `words[start..]` that stops at the first operand or right after `--`,
 * never permuting (the `+` optstrings of GNU env/timeout/xargs, and BSD getopt). Returns null
 * when an option needs an argument the words do not contain: the word after the prefix is then
 * that argument, not the wrapped command. Unknown or ambiguous options parse as flags because the
 * wrapper exits on them without running anything; that is safe only while every letter or long
 * name that takes an argument on GNU or BSD is listed in the grammar.
 */
export function parseOptions(
  words: readonly string[],
  start: number,
  grammar: OptionGrammar,
): ParsedOptions | null {
  const options: ParsedOption[] = []
  let cursor = start
  while (cursor < words.length) {
    const word = words[cursor]
    if (word === '--') return { next: cursor + 1, options }
    if (word === '-' && grammar.loneDash !== undefined) {
      options.push({ name: grammar.loneDash, value: undefined })
      cursor += 1
      continue
    }
    if (grammar.numeric !== undefined && NUMERIC_OPTION.test(word)) {
      options.push({ name: grammar.numeric, value: word.slice(1) })
      cursor += 1
      continue
    }
    if (!word.startsWith('-') || word === '-') break
    const next = word.startsWith('--')
      ? parseLongStyleOption(words, cursor, 2, grammar.long ?? {}, options)
      : singleDashLongMatch(word, grammar.singleDashLong)
        ? parseLongStyleOption(words, cursor, 1, grammar.singleDashLong ?? {}, options)
        : parseShortCluster(words, cursor, grammar, options)
    if (next === null) return null
    cursor = next
  }

  return { next: cursor, options }
}

function singleDashLongMatch(
  word: string,
  table: Readonly<Record<string, LongOptionArgument>> | undefined,
): boolean {
  if (table === undefined) return false
  const written = word.indexOf('=') === -1 ? word.slice(1) : word.slice(1, word.indexOf('='))
  return resolveLongName(written, table) !== undefined
}

// Shared by `--long` options (prefixLength 2) and BSD single-dash long options like `arch`'s
// `-arm64`/`-arch NAME` (prefixLength 1).
function parseLongStyleOption(
  words: readonly string[],
  cursor: number,
  prefixLength: number,
  table: Readonly<Record<string, LongOptionArgument>>,
  options: ParsedOption[],
): number | null {
  const word = words[cursor]
  const equalsIndex = word.indexOf('=')
  const written =
    equalsIndex === -1 ? word.slice(prefixLength) : word.slice(prefixLength, equalsIndex)
  const attached = equalsIndex === -1 ? undefined : word.slice(equalsIndex + 1)
  const name = resolveLongName(written, table)
  if (name === undefined) {
    options.push({ name: written, value: attached })
    return cursor + 1
  }
  if (table[name] === 'required' && attached === undefined) {
    const value = words[cursor + 1]
    if (value === undefined) return null
    options.push({ name, value })
    return cursor + 2
  }
  options.push({ name, value: attached })
  return cursor + 1
}

// getopt_long accepts any unambiguous prefix of a long option, so `env --ch /tmp` is `--chdir`.
function resolveLongName(
  written: string,
  long: Readonly<Record<string, LongOptionArgument>>,
): string | undefined {
  if (Object.hasOwn(long, written)) return written
  const matches = Object.keys(long).filter(name => name.startsWith(written))
  return matches.length === 1 ? matches[0] : undefined
}

function parseShortCluster(
  words: readonly string[],
  cursor: number,
  grammar: OptionGrammar,
  options: ParsedOption[],
): number | null {
  const word = words[cursor]
  for (let letterIndex = 1; letterIndex < word.length; letterIndex += 1) {
    const letter = word[letterIndex]
    const name = grammar.aliases?.[letter] ?? letter
    const attached = word.slice(letterIndex + 1)
    if (grammar.shortRequiredArgument?.includes(letter)) {
      if (attached !== '') {
        options.push({ name, value: attached })
        return cursor + 1
      }
      const value = words[cursor + 1]
      if (value === undefined) return null
      options.push({ name, value })
      return cursor + 2
    }
    if (grammar.shortOptionalArgument?.includes(letter)) {
      options.push({ name, value: attached === '' ? undefined : attached })
      return cursor + 1
    }
    options.push({ name, value: undefined })
  }

  return cursor + 1
}
