const SHELL_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/
const SHELL_COMMAND_SEPARATORS = new Set(['&&', '&', '(', ')', ';', '|', '||', '\n', '{', '}'])

export function commandSegmentStart(
  tokens: string[],
  index: number,
  isSeparator = isShellCommandSeparator,
): number {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (isSeparator(tokens[cursor])) {
      return cursor + 1
    }
  }

  return 0
}

export function isShellAssignment(token: string): boolean {
  return SHELL_ASSIGNMENT_RE.test(token)
}

export function isShellCommandSeparator(token: string): boolean {
  return SHELL_COMMAND_SEPARATORS.has(token)
}

export function nextShellCommandSeparatorIndex(tokens: string[], startIndex: number): number {
  for (let index = startIndex; index < tokens.length; index += 1) {
    if (isShellCommandSeparator(tokens[index])) {
      return index
    }
  }

  return tokens.length
}
