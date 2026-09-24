import { stripNonShellHeredocBodies } from './shell-heredoc.mts'
import { findShellScriptArguments } from './shell-script-operand.mts'
import { stripUnquotedShellComments } from './shell-tokenizer.mts'

const GIT_GLOBAL_OPTIONS_RE = new RegExp(
  String.raw`\bgit(?:\s+(?:` +
    String.raw`-C\s+(?:"[^"]*"|'[^']*'|\S+)|` +
    String.raw`-c\s+(?:"[^"]*"|'[^']*'|(?!core\.hooksPath\b)[^\s=]+(?:=(?:"[^"]*"|'[^']*'|\S+))?)|` +
    String.raw`--(?:git-dir|work-tree|namespace|exec-path)=[^\s]+|` +
    String.raw`--(?:no-pager|paginate|bare|no-replace-objects|version|help|html-path|man-path|info-path)|` +
    String.raw`-[vhpP]` +
    String.raw`))+`,
  'g',
)

/** Collapse `git -C <path>` / other globals so banned-subcommand regexes still match. */
export function stripGitGlobalOptionsForPolicy(command: string): string {
  return command.replace(GIT_GLOBAL_OPTIONS_RE, 'git')
}

export function commandsToInspectForGitPolicy(command: string): string[] {
  const unfolded = command.replace(/\\\n/g, ' ')
  const { shellBodies } = stripNonShellHeredocBodies(unfolded)
  const normalizedCommand = stripGitGlobalOptionsForPolicy(unfolded)
  return [
    stripQuotedShellText(normalizedCommand),
    ...extractShellCommandArguments(normalizedCommand).map(
      ({ command: shellCommand, inheritsEditor }) =>
        stripQuotedShellText(
          `${inheritsEditor ? 'export GIT_EDITOR=true; ' : ''}${stripGitGlobalOptionsForPolicy(shellCommand)}`,
        ),
    ),
    ...shellBodies.map(body =>
      stripQuotedShellText(stripGitGlobalOptionsForPolicy(body.replace(/\\\n/g, ' '))),
    ),
  ]
}

export type ShellCommandArgument = {
  command: string
  inheritsEditor: boolean
}

export function extractShellCommandArguments(command: string): ShellCommandArgument[] {
  const commandWithoutComments = stripUnquotedShellComments(command)
  return findShellScriptArguments(commandWithoutComments).map(({ script, shellIndex }) => ({
    command: script,
    inheritsEditor: shellCommandInheritsEditor(commandWithoutComments, shellIndex),
  }))
}

export function shellCommandInheritsEditor(command: string, shellCommandIndex: number): boolean {
  const segments = command
    .slice(0, shellCommandIndex)
    .split(/[;&|]/)
    .flatMap(segment => (segment.trim() ? [segment.trim()] : []))

  let exportedEditor = false
  for (const segment of segments) {
    if (/^unset\s+GIT_EDITOR\b/.test(segment)) {
      exportedEditor = false
      continue
    }

    if (/^export\s+GIT_EDITOR\s*=\s*(?:"true"|'true'|true)$/.test(segment)) {
      exportedEditor = true
      continue
    }

    if (/^export\s+GIT_EDITOR\s*=/.test(segment)) {
      exportedEditor = false
    }
  }

  const sameCommandPrefix = segments.at(-1) ?? ''
  return exportedEditor || envPrefixSetsEditor(sameCommandPrefix)
}

export function isInteractiveRebaseContinue(command: string): boolean {
  let exportedEditor = false
  for (const rawSegment of command.split(/&&|\|\||[;|]/)) {
    const segment = rawSegment.trim()
    if (segment === '') {
      continue
    }

    if (/^unset\s+GIT_EDITOR\b/.test(segment)) {
      exportedEditor = false
      continue
    }

    if (/^export\s+GIT_EDITOR\s*=\s*true\b/.test(segment)) {
      exportedEditor = true
      continue
    }

    if (/^export\s+GIT_EDITOR\s*=/.test(segment)) {
      exportedEditor = false
      continue
    }

    if (!/\bgit\s+rebase\b[^\n;&|()]*--continue\b/.test(segment)) {
      continue
    }

    const rebaseMatch = /\bgit\s+rebase\b[^\n;&|()]*--continue\b/.exec(segment)
    const rebaseIndex = rebaseMatch?.index ?? -1
    const envPrefix = rebaseIndex >= 0 ? segment.slice(0, rebaseIndex).trim() : ''

    if (rebaseIndex === 0 && exportedEditor) {
      continue
    }

    if (rebaseIndex >= 0 && envPrefixSetsEditor(envPrefix)) {
      continue
    }

    return true
  }

  return false
}

export function envPrefixSetsEditor(prefix: string): boolean {
  const tokens = prefix
    .replace(/^env\s+/, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return (
    tokens.length > 0 &&
    tokens.every(token => /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) &&
    tokens.some(token => /^GIT_EDITOR=(?:"true"|'true'|true)$/.test(token))
  )
}

export function stripQuotedShellText(command: string): string {
  const commandWithSafeEditor = command.replace(
    /\bGIT_EDITOR\s*=\s*(["'])true\1/g,
    'GIT_EDITOR=true',
  )
  let result = ''
  let quote: "'" | '"' | null = null
  let escaping = false

  for (const char of commandWithSafeEditor) {
    if (escaping) {
      result += quote === null ? char : ' '
      escaping = false
      continue
    }

    if (char === '\\') {
      result += quote === null ? char : ' '
      escaping = true
      continue
    }

    if (quote !== null) {
      if (char === quote) {
        quote = null
      }
      result += ' '
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      result += ' '
      continue
    }

    result += char
  }

  return result
}
