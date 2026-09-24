import type { BlockDecision } from './core.mts'
import type { GhInvocation } from './github-invocation.mts'
import type { CommandPrefix } from './shell-command-wrappers.mts'

/**
 * `xargs gh …` appends stdin items to gh's arguments and fills its replacement string (`-I {}`)
 * from stdin, so a gh subcommand that is missing or contains the replacement string is chosen at
 * run time. The GitHub policies key on that subcommand, so fail closed instead of guessing.
 */
export function findXargsGhSubcommandBlock(
  prefix: CommandPrefix,
  executable: string,
  invocation: GhInvocation | null,
): BlockDecision | null {
  const name = executable.slice(executable.lastIndexOf('/') + 1)
  if (!prefix.wrappers.includes('xargs') || (name !== 'gh' && name !== 'gh-stack')) return null
  const subcommand = invocation === null ? null : [invocation.area, invocation.action]
  if (
    subcommand !== null &&
    !prefix.xargsReplacements.some(replacement =>
      subcommand.some(word => word.includes(replacement)),
    )
  ) {
    return null
  }

  return {
    reason:
      '`xargs` supplies this gh subcommand from its input, so the hook cannot check it against the GitHub policies (draft-first PRs, merge authority, the gh stack allowlist). Run gh with a literal subcommand instead.',
  }
}
