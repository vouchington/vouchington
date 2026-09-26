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
