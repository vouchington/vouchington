import type { GitHubCommandContext } from './github-closing-refs.mts'
import { isGhCommandSeparator } from './github-options.mts'
import { extractShellCommandArguments } from './shell-commands.mts'
import { extractShellCommandSubstitutions } from './shell-command-substitutions.mts'
import { stripNonShellHeredocBodies } from './shell-heredoc.mts'
import { stripQuotedHeredocBodies } from './shell-heredoc-parser.mts'
import {
  commandSegmentStart as shellSegmentStart,
  isShellAssignment,
} from './shell-token-utils.mts'

export { isShellAssignment }

export function commandsToInspectForGitHubPolicy(command: string): string[] {
  const unfolded = command.replace(/\\\n/g, ' ')
  const { shellBodies } = stripNonShellHeredocBodies(unfolded)
  const normalizedCommand = stripQuotedHeredocBodies(unfolded)
  const commands = [normalizedCommand, ...shellBodies]
  const inspected = new Set<string>()

  for (let index = 0; index < commands.length; index += 1) {
    const candidate = commands[index]
    if (inspected.has(candidate)) {
      continue
    }
    inspected.add(candidate)
    commands.push(
      ...extractShellCommandArguments(candidate).map(({ command: shellCommand }) => shellCommand),
      ...extractShellCommandSubstitutions(candidate),
      ...stripNonShellHeredocBodies(candidate).shellBodies,
    )
  }

  return [...inspected]
}

export function commandEnvironment(
  tokens: string[],
  index: number,
): NonNullable<GitHubCommandContext['env']> {
  const segmentStart = commandSegmentStart(tokens, index)
  const env: Record<string, string | undefined> = {}
  let sawEnv = false
  let sawCommand = false

  for (let prefixIndex = segmentStart; prefixIndex < index; prefixIndex += 1) {
    const token = tokens[prefixIndex]
    if (isShellAssignment(token)) {
      const [name, value] = splitShellAssignment(token)
      env[name] = value
      continue
    }

    if (isShellControlPrefix(token) && !sawEnv && !sawCommand) {
      continue
    }

    if (token === 'command' && !sawCommand) {
      sawCommand = true
      continue
    }

    if (token === 'env' && !sawEnv && !sawCommand) {
      sawEnv = true
      continue
    }

    if (!sawEnv) {
      continue
    }

    if ((token === '-u' || token === '--unset') && tokens[prefixIndex + 1] !== undefined) {
      env[tokens[prefixIndex + 1]] = undefined
      prefixIndex += 1
      continue
    }

    if ((token.startsWith('-u') && token.length > 2) || token.startsWith('--unset=')) {
      const name = token.startsWith('--unset=') ? token.slice('--unset='.length) : token.slice(2)
      env[name] = undefined
    }
  }

  return env
}

export function commandSegmentStart(tokens: string[], index: number): number {
  return shellSegmentStart(tokens, index, isGhCommandSeparator)
}

export function isShellControlPrefix(token: string): boolean {
  return (
    token === 'if' ||
    token === 'while' ||
    token === 'until' ||
    token === 'elif' ||
    token === 'then' ||
    token === 'do' ||
    token === 'time' ||
    token === '!'
  )
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
// prefix assignment is just as resolvable a target — commandEnvironment already captures it, this
// only decides whether it counts toward the caller's repo resolution.
export function effectiveGhRepo(
  explicitRepo: string | undefined,
  tokens: string[],
  index: number,
): string | undefined {
  return (
    repoFromGhOption(explicitRepo) ?? repoFromGhOption(commandEnvironment(tokens, index).GH_REPO)
  )
}

function splitShellAssignment(token: string): [string, string] {
  const equalsIndex = token.indexOf('=')
  return [token.slice(0, equalsIndex), token.slice(equalsIndex + 1)]
}
