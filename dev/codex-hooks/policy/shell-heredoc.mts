import { heredocSpecsFromLine, type HeredocSpec } from './shell-heredoc-parser.mts'
import {
  commandSegmentStart,
  isShellAssignment,
  nextShellCommandSeparatorIndex,
} from './shell-token-utils.mts'
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

  return {
    shellBodies,
    textWithoutBodies: textLines.join('\n'),
  }
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

function tokensInvokeShell(tokens: string[]): boolean {
  const executableIndex = tokens.findIndex(
    token => !isShellAssignment(token) && token !== 'env' && !token.startsWith('-'),
  )
  if (executableIndex < 0) {
    return false
  }

  const executable = tokens[executableIndex].split('/').at(-1)
  return (
    SHELL_EXECUTABLES.has(executable ?? '') &&
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
