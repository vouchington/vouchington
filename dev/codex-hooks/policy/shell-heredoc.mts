import { parseCommandPrefix } from './shell-command-wrappers.mts'
import { heredocSpecsFromLine, type HeredocSpec } from './shell-heredoc-parser.mts'
import { redirectionOperatorOf } from './shell-redirections.mts'
import { commandSegmentStart, nextShellCommandSeparatorIndex } from './shell-token-utils.mts'
import { tokenizeShellWords } from './shell-tokenizer.mts'

const SHELL_EXECUTABLES = new Set(['bash', 'sh', 'zsh'])

type HeredocScan = {
  shellBodies: string[]
  textWithoutBodies: string
}

export function stripNonShellHeredocBodies(command: string): HeredocScan {
  const lines = command.split('\n')
  const textLines: string[] = []
  const shellBodies: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const specs = heredocSpecsFromLine(line)
    textLines.push(line)
    if (specs.length === 0) {
      continue
    }

    const isShellScriptHeredoc = lineHasDirectShellHeredoc(line)
    for (const spec of specs) {
      const bodyLines: string[] = []
      index += 1
      while (index < lines.length && heredocLineDelimiter(lines[index], spec) !== spec.delimiter) {
        bodyLines.push(lines[index])
        index += 1
      }

      if (isShellScriptHeredoc) {
        shellBodies.push(bodyLines.join('\n'))
      }
    }
  }

  const textWithoutBodies = textLines.join('\n')
  return {
    shellBodies: [...shellBodies, ...shellHereStrings(textWithoutBodies)],
    textWithoutBodies,
  }
}

// `bash <<< 'gh pr merge 1'` and `cat <<< '…' | sh` read the here-string as the script, as they
// would a heredoc body.
function shellHereStrings(command: string): string[] {
  const tokens = tokenizeShellWords(command, { splitRedirections: true })
  return tokens.flatMap((token, index) => {
    if (redirectionOperatorOf(token) !== '<<<' || index + 1 >= tokens.length) return []
    const segmentEnd = nextShellCommandSeparatorIndex(tokens, index)
    const readsScript =
      tokensInvokeShell(tokens.slice(commandSegmentStart(tokens, index), segmentEnd)) ||
      (tokens[segmentEnd] === '|' &&
        tokensInvokeShell(
          tokens.slice(segmentEnd + 1, nextShellCommandSeparatorIndex(tokens, segmentEnd + 1)),
        ))
    return readsScript ? [tokens[index + 1]] : []
  })
}

function heredocLineDelimiter(line: string, spec: HeredocSpec): string {
  return spec.stripLeadingTabs ? line.replace(/^\t+/, '') : line
}

function lineHasDirectShellHeredoc(line: string): boolean {
  const tokens = tokenizeShellWords(line)
  const heredocIndex = tokens.findIndex(token => token.startsWith('<<'))
  if (heredocIndex <= 0) {
    return false
  }

  const segmentStart = commandSegmentStart(tokens, heredocIndex)
  const commandTokens = tokens.slice(segmentStart, heredocIndex)
  if (tokensInvokeShell(commandTokens)) {
    return true
  }

  const pipeIndex = tokens.indexOf('|', heredocValueEndIndex(tokens, heredocIndex) + 1)
  if (pipeIndex < 0) {
    return false
  }

  const segmentEnd = nextShellCommandSeparatorIndex(tokens, pipeIndex + 1)
  return tokensInvokeShell(tokens.slice(pipeIndex + 1, segmentEnd))
}

// A shell reads the heredoc as its script when it is the command word after a recognized wrapper
// chain (`timeout 5 bash`, `env -C /tmp sh`) and no `-c` string replaces stdin as the script.
function tokensInvokeShell(tokens: string[]): boolean {
  const executableIndex = tokens.findIndex(
    (token, index) =>
      SHELL_EXECUTABLES.has(token.slice(token.lastIndexOf('/') + 1)) &&
      parseCommandPrefix(tokens.slice(0, index)) !== null,
  )
  return (
    executableIndex >= 0 &&
    !tokens.slice(executableIndex + 1).some(token => /^-[A-Za-z]*c[A-Za-z]*$/.test(token))
  )
}

function heredocValueEndIndex(tokens: string[], heredocIndex: number): number {
  const token = tokens[heredocIndex]
  if (token === '<<' || token === '<<-') {
    return Math.min(heredocIndex + 1, tokens.length - 1)
  }

  return heredocIndex
}
