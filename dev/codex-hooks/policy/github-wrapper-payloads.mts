import { isCommandPositionInvocation } from './github-command-position.mts'
import { isGhCommandSeparator } from './github-options.mts'
import { parseOptions } from './shell-option-grammar.mts'
import { type ShellWord, tokenizeShellWordsDetailed } from './shell-tokenizer.mts'
import {
  isBareVariableWord,
  resolveLiteralAssignments,
  variableName,
} from './shell-variable-assignments.mts'
import { WATCH_GRAMMAR } from './shell-wrapper-exec-grammars.mts'
import { ENV_GRAMMAR } from './shell-wrapper-grammars.mts'

// `$(which gh)`, `"$(command -v gh)"`, and `` `type -p gh` `` expand to the gh binary itself.
const GH_LOOKUP = String.raw`(?:which|command\s+-v|type\s+-[pP]|whence\s+-p)\s+(gh(?:-stack)?)`
const GH_LOOKUP_SUBSTITUTION = new RegExp(
  String.raw`(")?(?:\$\(\s*${GH_LOOKUP}\s*\)|\x60\s*${GH_LOOKUP}\s*\x60)\1`,
  'g',
)
const PAYLOAD_COMMANDS = new Set(['alias', 'env', 'eval', 'gh', 'watch'])

/**
 * Commands a wrapper or definition runs that the token-level policy scan cannot see as words:
 * `eval` arguments, `env -S` split strings, `alias` values, `gh alias set` expansions, and a gh
 * executable written as `$(which gh)`. Each payload is inspected like any other nested command.
 */
export function extractWrapperPayloads(command: string): string[] {
  const payloads: string[] = []
  const resolved = command.replace(
    GH_LOOKUP_SUBSTITUTION,
    (_match, _quote, substitutionName: string | undefined, backtickName: string | undefined) =>
      substitutionName ?? backtickName ?? '',
  )
  if (resolved !== command) payloads.push(resolved)

  const words = tokenizeShellWordsDetailed(command, { splitRedirections: true })
  const values = words.map(word => word.value)
  for (let index = 0; index < values.length; index += 1) {
    const name = values[index].slice(values[index].lastIndexOf('/') + 1)
    const variable = isBareVariableWord(values[index])
    // Check the name first: the command-position check rescans the segment up to this word. A
    // bare variable word (`$GH`) is not a payload command name, so it must pass this filter too.
    if (!PAYLOAD_COMMANDS.has(name) && !variable) continue
    if (!isCommandPositionInvocation(values, index)) continue
    let end = index + 1
    while (end < values.length && !isGhCommandSeparator(values[end])) end += 1
    const args = words.slice(index + 1, end)
    if (name === 'eval') payloads.push(...resolvedEvalPayload(args, values, index))
    if (name === 'alias') payloads.push(...aliasValues(args))
    if (name === 'env') payloads.push(...envSplitStringPayloads(args))
    if (name === 'gh') payloads.push(...ghAliasPayloads(args))
    if (name === 'watch') payloads.push(watchPayload(args))
    if (variable) {
      const variableExecutable = resolvedVariableExecutablePayload(args, values, index)
      if (variableExecutable !== null) payloads.push(variableExecutable)
    }
  }

  return payloads
}

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
function resolvedEvalPayload(args: ShellWord[], tokens: string[], index: number): string[] {
  const operands = args[0]?.value === '--' ? args.slice(1) : args
  const joined = operands.map(arg => arg.value).join(' ')
  if (operands.length !== 1 || !isBareVariableWord(joined)) return [joined]
  const resolved = resolveLiteralAssignments(tokens, index)[variableName(joined)]
  return resolved === undefined ? [] : [resolved]
}

// `watch` re-runs its argument through the shell on an interval, like eval but re-parsed with its
// own option grammar first so `watch -n 2 gh …` does not join the interval into the payload.
function watchPayload(args: ShellWord[]): string {
  const values = args.map(arg => arg.value)
  const parsed = parseOptions(values, 0, WATCH_GRAMMAR)
  const operands = parsed === null ? args : args.slice(parsed.next)
  return operands.map(arg => arg.value).join(' ')
}

// An alias runs its value followed by whatever words come after the alias name, and a non-shell
// gh alias appends its extra arguments the same way, so `alias g='gh pr'` or `gh alias set p pr`
// leaves the action to each use. `"$@"` stands for those words.
const FORWARDED_ARGUMENTS = ' "$@"'

// `GH=gh; $GH pr merge 1` chooses its executable from a literal same-command assignment. Rebuild
// the invocation with the resolved executable so it is checked like any other candidate command.
// Unlike eval's or watch's payload, `$GH`'s arguments are already-split words the shell never
// re-parses, so they are re-quoted (like envSplitStringPayloads below) rather than joined as-is:
// an unquoted join would turn a `;` or `#` inside a quoted value into a real separator or comment
// once the payload is re-tokenized (`--title "x; gh pr merge 1"` must not become two commands).
function resolvedVariableExecutablePayload(
  args: ShellWord[],
  tokens: string[],
  index: number,
): string | null {
  if (!isBareVariableWord(tokens[index])) return null
  const resolved = resolveLiteralAssignments(tokens, index)[variableName(tokens[index])]
  if (resolved === undefined) return null
  return [resolved, ...args.map(quoteWord)].join(' ')
}

function aliasValues(args: ShellWord[]): string[] {
  return args.flatMap(({ value }) => {
    const equalsIndex = value.indexOf('=')
    return equalsIndex > 0 ? [`${value.slice(equalsIndex + 1)}${FORWARDED_ARGUMENTS}`] : []
  })
}

// env splits an -S string into separate arguments in place of the option and keeps parsing, so
// `env -C /tmp -S 'gh pr merge 1'` runs `gh pr merge 1` in /tmp. Rebuild that invocation. GNU and
// BSD env read `\_` as a space: a separator outside double quotes, a literal space inside them.
// The rebuilt shell text keeps either meaning once `\_` becomes a space.
function envSplitStringPayloads(args: ShellWord[]): string[] {
  const parsed = parseOptions(
    args.map(arg => arg.value),
    0,
    ENV_GRAMMAR,
  )
  if (parsed === null || !parsed.options.some(option => option.name === 'split-string')) return []
  const options = parsed.options.map(({ name, value }) => {
    if (name === 'split-string') {
      return value?.replace(/\\([\s\S])/g, (escape, char: string) => (char === '_' ? ' ' : escape))
    }
    const attached = value === undefined ? '' : name.length === 1 ? value : `=${value}`
    return quoteWord({
      expandable: false,
      value: `-${name.length === 1 ? '' : '-'}${name}${attached}`,
    })
  })
  return [['env', ...options, ...args.slice(parsed.next).map(quoteWord)].join(' ')]
}

function ghAliasPayloads(args: ShellWord[]): string[] {
  if (args[0]?.value !== 'alias' || args[1]?.value !== 'set') return []
  const rest = args.slice(2).map(arg => arg.value)
  const shell = rest.some(value => value === '-s' || value === '--shell')
  const [, expansion] = rest.filter(value => !value.startsWith('-'))
  if (expansion === undefined) return []
  return shell || expansion.startsWith('!')
    ? [expansion.replace(/^!/, '')]
    : [`gh ${expansion}${FORWARDED_ARGUMENTS}`]
}

function quoteWord({ expandable, value }: ShellWord): string {
  return expandable ? `"${value.replace(/["\\]/g, '\\$&')}"` : `'${value.replace(/'/g, "'\\''")}'`
}
