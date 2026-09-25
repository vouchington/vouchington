import type { GitHubCommandContext } from './github-closing-refs.mts'
import { extractShellCommandArguments } from './shell-commands.mts'
import { extractShellCommandSubstitutions } from './shell-command-substitutions.mts'
import { stripNonShellHeredocBodies } from './shell-heredoc.mts'

/**
 * The command text and every script nested in it that the GitHub policies read. A heredoc body is
 * data unless a shell may read it as its script, but an unquoted-delimiter body still runs its
 * command substitutions, so each candidate is read with its bodies blanked.
 */
export function commandsToInspectForGitHubPolicy(command: string): string[] {
  const commands = [command.replace(/\\\n/g, ' ')]
  const inspected = new Set<string>()

  for (let index = 0; index < commands.length; index += 1) {
    const {
      bodySubstitutions,
      shellBodies,
      textWithoutBodies: candidate,
    } = stripNonShellHeredocBodies(commands[index])
    if (inspected.has(candidate)) {
      continue
    }
    inspected.add(candidate)
    commands.push(
      ...extractShellCommandArguments(candidate).map(({ command: shellCommand }) => shellCommand),
      ...extractShellCommandSubstitutions(candidate),
      ...shellBodies,
      ...bodySubstitutions,
    )
  }

  return [...inspected]
}

export function repoFromGhOption(repo: string | undefined): string | undefined {
  if (repo === undefined || repo.trim() === '') {
    return undefined
  }
  const parts = repo.split('/').filter(part => part.length > 0)
  if (parts.length < 2) {
    return undefined
  }

  return `${parts.at(-2)}/${parts.at(-1)}`.toLowerCase()
}

// `--repo` wins when both are present (gh's own precedence), but a literal `GH_REPO=owner/repo`
// prefix assignment is just as resolvable a target — the command prefix's env already captures
// it, this only decides whether it counts toward the caller's repo resolution.
export function effectiveGhRepo(
  explicitRepo: string | undefined,
  env: NonNullable<GitHubCommandContext['env']>,
): string | undefined {
  return repoFromGhOption(explicitRepo) ?? repoFromGhOption(env.GH_REPO)
}
