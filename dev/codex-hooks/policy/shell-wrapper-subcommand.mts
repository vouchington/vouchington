import { parseOptions } from './shell-option-grammar.mts'
import type { Wrapper } from './shell-wrapper-grammars.mts'

/**
 * Advances past a wrapper's subcommand (`pnpm exec`, `mise exec`/`mise x`) and its own options,
 * past operands up to a required `--` (`mise exec node@20 -- gh …`), and past the wrapper's own
 * fixed operand count (`timeout DURATION`), returning the index of the wrapped command's first
 * word. Returns null when a required subcommand or `--` is missing, the subcommand's own options
 * are malformed, or the wrapper's words run past the end of the command.
 */
export function wrapperCommandStart(
  words: readonly string[],
  next: number,
  wrapper: Wrapper,
): number | null {
  let cursor = next
  if (wrapper.subcommand !== undefined) {
    const subcommandWord = words[cursor]
    if (subcommandWord === undefined || !wrapper.subcommand.includes(subcommandWord)) return null
    cursor += 1
    if (wrapper.subcommandGrammar !== undefined) {
      const subParsed = parseOptions(words, cursor, wrapper.subcommandGrammar)
      if (subParsed === null) return null
      cursor = subParsed.next
    }
  }
  if (wrapper.operandsUntilDoubleDash === true) {
    const dashIndex = words.indexOf('--', cursor)
    if (dashIndex === -1) return null
    cursor = dashIndex + 1
  }
  cursor += wrapper.operands ?? 0
  return cursor > words.length ? null : cursor
}
