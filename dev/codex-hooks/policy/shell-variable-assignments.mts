import { isShellAssignment, isShellCommandSeparator } from './shell-token-utils.mts'

const BARE_VARIABLE = /^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/

/** A bare parameter expansion with no other text (`$CMD`, `${CMD}`), as opposed to a command
 * substitution (`$(...)`) or a variable embedded in a longer word (`$HOME/bin`). */
export function isBareVariableWord(word: string): boolean {
  return BARE_VARIABLE.test(word)
}

/** The variable name inside a bare parameter expansion (`variableName('$CMD') === 'CMD'`). */
export function variableName(word: string): string {
  return BARE_VARIABLE.exec(word)?.[1] ?? word
}

/**
 * Literal values of standalone assignment segments (`NAME=value`, optionally `export NAME=value`)
 * strictly before `uptoIndex`, so `CMD="gh pr merge 1"; eval "$CMD"` can be checked like a literal
 * gh command. A value containing `$` or a backtick is not literal, so it resolves to `undefined`:
 * the hook cannot read it either, the same as no assignment at all.
 */
export function resolveLiteralAssignments(
  tokens: string[],
  uptoIndex: number,
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {}
  let segmentStart = 0
  for (let cursor = 0; cursor <= uptoIndex; cursor += 1) {
    if (cursor !== uptoIndex && !isShellCommandSeparator(tokens[cursor])) continue
    const segment = tokens.slice(segmentStart, cursor).filter(token => token !== 'export')
    if (segment.length > 0 && segment.every(isShellAssignment)) {
      for (const token of segment) {
        const equalsIndex = token.indexOf('=')
        const value = token.slice(equalsIndex + 1)
        result[token.slice(0, equalsIndex)] = /[$`]/.test(value) ? undefined : value
      }
    }
    segmentStart = cursor + 1
  }
  return result
}
