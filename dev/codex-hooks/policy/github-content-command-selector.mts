import type { GhInvocation } from './github-invocation.mts'
import {
  ISSUE_CREATE_FLAGS,
  PR_CREATE_FLAGS,
  PR_EDIT_FLAGS,
  type ContentCommandFlagSet,
} from './github-content-command-flags.mts'
import { globalRepositorySelectors } from './github-global-repository-selector.mts'
import type { ShellWord } from './shell-tokenizer.mts'

type ParsedCommandArguments = {
  repository: string | undefined
  positional: ShellWord[]
}

/**
 * Parses only documented value-taking and boolean options for the create/edit command. Unknown
 * flags or missing values make the target unproven, so a value consumed by a newer gh option can
 * never be mistaken for `--repo` or a PR selector.
 */
export function parseContentCommandArguments(
  args: ShellWord[],
  flags: ContentCommandFlagSet,
): ParsedCommandArguments | undefined {
  const positional: ShellWord[] = []
  let repository: string | undefined
  let positionalOnly = false

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index]
    const token = word.value
    if (positionalOnly) {
      positional.push(word)
      continue
    }
    if (token === '--') {
      positionalOnly = true
      continue
    }
    if (token.startsWith('--')) {
      const equals = token.indexOf('=')
      const name = equals < 0 ? token : token.slice(0, equals)
      const isRepository = flags.longValueFlags.get(name)
      if (isRepository !== undefined) {
        const value = equals >= 0 ? token.slice(equals + 1) : args[index + 1]?.value
        if (value === undefined) return undefined
        if (isRepository) repository = value
        if (equals < 0) index += 1
        continue
      }
      if (flags.longBooleanFlags.has(name)) {
        if (equals >= 0 && !isBooleanValue(token.slice(equals + 1))) return undefined
        continue
      }
      return undefined
    }
    if (token.startsWith('-') && token !== '-') {
      const aliases = token.slice(1)
      if (aliases.length === 0) return undefined
      let consumedValue = false
      for (let offset = 0; offset < aliases.length; offset += 1) {
        const alias = aliases[offset]
        const isRepository = flags.shortValueFlags.get(alias)
        if (isRepository !== undefined) {
          const attached = aliases.slice(offset + 1)
          const value = attached.length > 0 ? attached.replace(/^=/, '') : args[index + 1]?.value
          if (value === undefined) return undefined
          if (isRepository) repository = value
          if (attached.length === 0) index += 1
          consumedValue = true
          break
        }
        if (!flags.shortBooleanFlags.has(alias)) return undefined
        const attachedBooleanValue = aliases.slice(offset + 1)
        if (attachedBooleanValue.startsWith('=')) {
          if (!isBooleanValue(attachedBooleanValue.slice(1))) return undefined
          break
        }
      }
      if (consumedValue || aliases.length > 0) continue
    }
    positional.push(word)
  }

  return { repository, positional }
}

/** Repository selector for `gh pr create/new` and `gh issue create`. */
export function contentCommandRepositorySelector(
  invocation: GhInvocation,
  words: ShellWord[],
): string | null | undefined {
  const flags = invocation.area === 'pr' ? PR_CREATE_FLAGS : ISSUE_CREATE_FLAGS
  const args = invocation.argumentTokenIndexes.map(index => words[index])
  const parsed = parseContentCommandArguments(args, flags)
  if (parsed === undefined || parsed.positional.length > 0) return undefined
  return parsed.repository ?? globalRepositorySelectors(invocation, words).at(-1) ?? null
}

/** Parsed target and positional PR selector for `gh pr edit`. */
export function editCommandArguments(
  invocation: GhInvocation,
  words: ShellWord[],
): ParsedCommandArguments | undefined {
  const args = invocation.argumentTokenIndexes.map(index => words[index])
  return parseContentCommandArguments(args, PR_EDIT_FLAGS)
}

function isBooleanValue(value: string): boolean {
  return /^(?:1|t|true|0|f|false)$/i.test(value)
}
