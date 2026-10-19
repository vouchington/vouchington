import type { GhInvocation } from './github-invocation.mts'
import { globalRepositorySelectors } from './github-pr-edit-selector.mts'
import type { ShellWord } from './shell-tokenizer.mts'

const VALUE_FLAGS = new Set([
  '--assignee',
  '-a',
  '--base',
  '-B',
  '--body',
  '-b',
  '--body-file',
  '-F',
  '--head',
  '--label',
  '-l',
  '--milestone',
  '-m',
  '--project',
  '--recover',
  '--repo',
  '-R',
  '--reviewer',
  '--template',
  '--title',
  '-t',
])
const BOOLEAN_FLAGS = new Set(['--draft', '--fill', '--fill-first', '--web', '--help', '-h'])

/**
 * Repository selector for create commands. Unknown flags make the target unproven so a value
 * consumed by a newer gh option can never be mistaken for `--repo`.
 */
export function contentCommandRepositorySelector(
  invocation: GhInvocation,
  words: ShellWord[],
): string | null | undefined {
  const args = invocation.argumentTokenIndexes.map(index => words[index].value)
  let repository: string | undefined
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (token === '--') return undefined
    if (!token.startsWith('-')) return undefined

    const equals = token.indexOf('=')
    const flag = equals < 0 ? token : token.slice(0, equals)
    const attachedRepo = flag.startsWith('-R') && flag !== '-R'
    if (flag === '--repo' || flag === '-R' || attachedRepo) {
      const value =
        equals >= 0 ? token.slice(equals + 1) : attachedRepo ? token.slice(2) : args[index + 1]
      if (value === undefined) return undefined
      if (!attachedRepo && equals < 0) index += 1
      repository = value
      continue
    }

    if (BOOLEAN_FLAGS.has(flag)) {
      if (equals >= 0) return undefined
      continue
    }
    if (!VALUE_FLAGS.has(flag)) return undefined
    if (equals < 0) {
      if (args[index + 1] === undefined) return undefined
      index += 1
    }
  }

  return repository ?? globalRepositorySelectors(invocation, words).at(-1) ?? null
}
