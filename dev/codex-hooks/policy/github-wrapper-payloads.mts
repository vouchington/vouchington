import { isCommandPositionInvocation } from './github-command-position.mts'
import { isGhCommandSeparator } from './github-options.mts'
import {
  miseCommandPayload,
  npxCallPayload,
  scriptCommandPayload,
} from './github-wrapper-payloads-exec-forms.mts'
import {
  quoteWord,
  resolvedEvalPayload,
  resolvedVariableExecutablePayload,
} from './github-wrapper-payloads-variables.mts'
import { parseOptions } from './shell-option-grammar.mts'
import { type ShellWord, tokenizeShellWordsDetailed } from './shell-tokenizer.mts'
import { isBareVariableWord } from './shell-variable-assignments.mts'
import { WATCH_GRAMMAR } from './shell-wrapper-exec-grammars.mts'
import { ENV_GRAMMAR } from './shell-wrapper-grammars.mts'

// `$(which gh)`, `"$(command -v gh)"`, and `` `type -p gh` `` expand to the gh binary itself.
const GH_LOOKUP = String.raw`(?:which|command\s+-v|type\s+-[pP]|whence\s+-p)\s+(gh(?:-stack)?)`
const GH_LOOKUP_SUBSTITUTION = new RegExp(
  String.raw`(")?(?:\$\(\s*${GH_LOOKUP}\s*\)|\x60\s*${GH_LOOKUP}\s*\x60)\1`,
  'g',
)

type PayloadExtractor = (args: ShellWord[], tokens: string[], index: number) => string[]

// Each entry's key is a command name whose payload is checked below. A `Map` (not a plain
// object), so an arbitrary command word can never resolve to an Object.prototype member
// (`constructor`, `toString`) the way a lookup on `{}` would. The key set replaces the old
// PAYLOAD_COMMANDS list so it cannot drift from the handler it dispatches to.
const PAYLOAD_EXTRACTORS: ReadonlyMap<string, PayloadExtractor> = new Map([
  ['alias', aliasValues],
  ['env', envSplitStringPayloads],
  ['eval', resolvedEvalPayload],
  ['gh', ghAliasPayloads],
  ['mise', miseCommandPayload],
  ['npx', npxCallPayload],
  ['script', scriptCommandPayload],
  ['watch', (args: ShellWord[]): string[] => [watchPayload(args)]],
])

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
    // Check the name first: the command-position check rescans the segment up to this word. A
    // bare variable word (`$GH`) has no payload command name, so it falls back to that check too.
    const extract =
      PAYLOAD_EXTRACTORS.get(name) ??
      (isBareVariableWord(values[index]) ? variableExecutablePayload : undefined)
    if (extract === undefined) continue
    if (!isCommandPositionInvocation(values, index)) continue
    let end = index + 1
    while (end < values.length && !isGhCommandSeparator(values[end])) end += 1
    const args = words.slice(index + 1, end)
    payloads.push(...extract(args, values, index))
  }

  return payloads
}

function variableExecutablePayload(args: ShellWord[], tokens: string[], index: number): string[] {
  const resolved = resolvedVariableExecutablePayload(args, tokens, index)
  return resolved === null ? [] : [resolved]
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
