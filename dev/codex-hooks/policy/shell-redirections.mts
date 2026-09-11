export const SHELL_REDIRECTION_OPERATORS = [
  '&>>',
  '<<<',
  '<<-',
  '&>',
  '>>',
  '>&',
  '>|',
  '<<',
  '<&',
  '<>',
  '>',
  '<',
] as const

export function shellRedirectionOperatorAt(command: string, index: number): string | null {
  const suffix = command.slice(index)
  return SHELL_REDIRECTION_OPERATORS.find(operator => suffix.startsWith(operator)) ?? null
}

// tokenizeShellWords({splitRedirections:true}) fuses a leading file-descriptor digit into the
// operator token itself (e.g. `2>` for `gh pr merge 123 2> --auto`) — strip it before matching.
export function isShellRedirectionOperatorToken(token: string): boolean {
  const withoutFdPrefix = token.replace(/^\d+/, '')
  return (SHELL_REDIRECTION_OPERATORS as readonly string[]).includes(withoutFdPrefix)
}
