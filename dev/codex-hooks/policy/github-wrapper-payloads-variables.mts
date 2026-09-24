import type { ShellWord } from './shell-tokenizer.mts'
import {
  isBareVariableWord,
  resolveLiteralAssignments,
  variableName,
} from './shell-variable-assignments.mts'

/**
 * eval joins its arguments with spaces and runs the result as shell input. That joined text is
 * the payload whenever it is not a single, whole-argument bare parameter expansion, whether it is
 * fully literal or has an expansion embedded in a longer literal (`eval "gh pr merge $1"` is
 * still checked as `gh pr merge $1`, an unresolvable operand that does not change which gh
 * subcommand runs). Only a single bare expansion (`eval "$CMD"`) is resolved instead: a literal
 * same-command assignment's value becomes the payload, or there is no payload when it cannot be
 * resolved (the opaque-gh policy fails closed on that case) — a command substitution operand
 * (`eval "$(mise activate zsh)"`) is not bare-variable-shaped, so it takes the literal branch and
 * is checked as-is, same as before this resolution existed.
 */
export function resolvedEvalPayload(args: ShellWord[], tokens: string[], index: number): string[] {
  const operands = args[0]?.value === '--' ? args.slice(1) : args
  const joined = operands.map(arg => arg.value).join(' ')
  if (operands.length !== 1 || !isBareVariableWord(joined)) return [joined]
  const resolved = resolveLiteralAssignments(tokens, index)[variableName(joined)]
  return resolved === undefined ? [] : [resolved]
}

// `GH=gh; $GH pr merge 1` chooses its executable from a literal same-command assignment. Rebuild
// the invocation with the resolved executable so it is checked like any other candidate command.
// Unlike eval's or watch's payload, `$GH`'s arguments are already-split words the shell never
// re-parses, so they are re-quoted (like envSplitStringPayloads in github-wrapper-payloads.mts)
// rather than joined as-is: an unquoted join would turn a `;` or `#` inside a quoted value into a
// real separator or comment once the payload is re-tokenized (`--title "x; gh pr merge 1"` must
// not become two commands).
export function resolvedVariableExecutablePayload(
  args: ShellWord[],
  tokens: string[],
  index: number,
): string | null {
  if (!isBareVariableWord(tokens[index])) return null
  const resolved = resolveLiteralAssignments(tokens, index)[variableName(tokens[index])]
  if (resolved === undefined) return null
  return [resolved, ...args.map(quoteWord)].join(' ')
}

export function quoteWord({ expandable, value }: ShellWord): string {
  return expandable ? `"${value.replace(/["\\]/g, '\\$&')}"` : `'${value.replace(/'/g, "'\\''")}'`
}
