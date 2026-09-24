import { isCommandPositionInvocation } from './github-command-position.mts'
import { isGhCommandSeparator } from './github-options.mts'
import { parseOptions } from './shell-option-grammar.mts'
import { type ShellWord, tokenizeShellWordsDetailed } from './shell-tokenizer.mts'
import { ENV_GRAMMAR } from './shell-wrapper-grammars.mts'

// `$(which gh)`, `"$(command -v gh)"`, and `` `type -p gh` `` expand to the gh binary itself.
const GH_LOOKUP = String.raw`(?:which|command\s+-v|type\s+-[pP]|whence\s+-p)\s+(gh(?:-stack)?)`
const GH_LOOKUP_SUBSTITUTION = new RegExp(
  String.raw`(")?(?:\$\(\s*${GH_LOOKUP}\s*\)|\x60\s*${GH_LOOKUP}\s*\x60)\1`,
  'g',
)

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
    if (!isCommandPositionInvocation(values, index)) continue
    let end = index + 1
    while (end < values.length && !isGhCommandSeparator(values[end])) end += 1
    const args = words.slice(index + 1, end)
    const name = values[index].slice(values[index].lastIndexOf('/') + 1)
    if (name === 'eval') payloads.push(evalPayload(args))
    if (name === 'alias') payloads.push(...aliasValues(args))
    if (name === 'env') payloads.push(...envSplitStringPayloads(args))
    if (name === 'gh') payloads.push(...ghAliasPayloads(args))
  }

  return payloads
}

// eval joins its arguments with spaces and runs the result as shell input.
function evalPayload(args: ShellWord[]): string {
  const operands = args[0]?.value === '--' ? args.slice(1) : args
  return operands.map(arg => arg.value).join(' ')
}

// An alias runs its value followed by whatever words come after the alias name, and a non-shell
// gh alias appends its extra arguments the same way, so `alias g='gh pr'` or `gh alias set p pr`
// leaves the action to each use. `"$@"` stands for those words.
const FORWARDED_ARGUMENTS = ' "$@"'

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
