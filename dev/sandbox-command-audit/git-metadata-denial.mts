// Shared Claude/Codex matcher: Git metadata write denials need write-path fixes, not allowlisting.

const ASSIGNMENT_PREFIX = /[A-Za-z_][A-Za-z0-9_]*=(?:"(?:\\.|[^"\\])*"|'[^']*'|[^\s;&|'"]+)/
const GIT_COMMAND_PATTERN = new RegExp(
  `^(?:${ASSIGNMENT_PREFIX.source}\\s+)*(?:[^\\s;&|]*\\/)?git(?:\\s|$)`,
)
const ENV_INVOCATION = new RegExp(
  `^(?:${ASSIGNMENT_PREFIX.source}\\s+)*(?:[^\\s;&|]*\\/)?env(?:\\s+(?:-(?:u|-unset)(?:\\s+[A-Za-z_][A-Za-z0-9_]*|=[A-Za-z_][A-Za-z0-9_]*)|-[A-Za-z0-9-]+(?:=(?:"(?:\\\\.|[^"\\\\])*"|'[^']*'|[^\\s;&|'"]+))?|${ASSIGNMENT_PREFIX.source}))*\\s+`,
)
const SHELL_SETUP_PATTERN =
  /^(?:set(?:\s|$)|cd(?:\s|$)|export(?:\s|$)|[A-Za-z_][A-Za-z0-9_]*=(?:"(?:\\.|[^"\\])*"|'[^']*'|[^\s;&|'"]+)$)/
const SAFE_REPORTING_COMMAND_PATTERN = /^(?:echo|printf|true|:)(?:\s|$)/

function hasUnsafeShellEvaluation(segment: string): boolean {
  let quote: "'" | '"' | undefined
  let escaped = false

  for (let index = 0; index < segment.length; index += 1) {
    const character = segment[index]!
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote === "'") {
      if (character === "'") quote = undefined
      continue
    }
    if (quote === '"') {
      if (character === '"') quote = undefined
      else if (character === '`' || (character === '$' && segment[index + 1] === '(')) {
        return true
      }
      continue
    }
    if (character === "'") {
      quote = "'"
      continue
    }
    if (character === '"') {
      quote = '"'
      continue
    }
    if (character === '`' || (character === '$' && segment[index + 1] === '(')) {
      return true
    }
    if (character !== '<' && character !== '>') continue

    const descriptorTarget = segment.slice(index + 1).match(/^&[\d-]+/)
    if (descriptorTarget === null) return true
    index += descriptorTarget[0].length
  }
  return false
}

function isGitCommand(segment: string): boolean {
  const env = ENV_INVOCATION.exec(segment)
  return (
    GIT_COMMAND_PATTERN.test(env === null ? segment : segment.slice(env[0].length)) &&
    !hasUnsafeShellEvaluation(segment)
  )
}

function isShellSetupCommand(segment: string): boolean {
  return SHELL_SETUP_PATTERN.test(segment) && !hasUnsafeShellEvaluation(segment)
}

function isSafeReportingCommand(segment: string): boolean {
  return SAFE_REPORTING_COMMAND_PATTERN.test(segment) && !hasUnsafeShellEvaluation(segment)
}

const PERMISSION_TOKEN =
  /operation not permitted|permission denied|read-only file system|\bEPERM\b|\bEROFS\b/gi
const GIT_DIAGNOSTIC_PREFIX = /(?:^|[\s'"])(?:fatal|error|warning):\s/i

function gitMetadataRelativePath(path: string): string | undefined {
  if (path.startsWith('.git/')) return path.slice('.git/'.length)
  const gitDirectoryIndex = path.lastIndexOf('/.git/')
  if (gitDirectoryIndex >= 0) return path.slice(gitDirectoryIndex + '/.git/'.length)
  if (path.startsWith('refs/') || path.startsWith('logs/refs/')) return path
  return undefined
}

function isGitMetadataPath(path: string): boolean {
  const relative = gitMetadataRelativePath(path)
  return (
    relative !== undefined &&
    (relative.startsWith('worktrees/') ||
      relative === 'config' ||
      relative === 'packed-refs' ||
      relative.startsWith('packed-refs.') ||
      relative === 'refs' ||
      relative.startsWith('refs/') ||
      relative === 'logs/refs' ||
      relative.startsWith('logs/refs/'))
  )
}

function commandSegments(command: string): string[] {
  const segments: string[] = []
  let start = 0
  let quote: "'" | '"' | undefined
  let escaped = false

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]!
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote !== undefined) {
      if (character === quote) quote = undefined
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      continue
    }
    const startsComment = character === '#' && (index === start || /\s/.test(command[index - 1]!))
    if (startsComment) {
      const segment = command.slice(start, index).trim()
      if (segment.length > 0) segments.push(segment)
      const newlineIndex = command.indexOf('\n', index + 1)
      if (newlineIndex < 0) {
        start = command.length
        break
      }
      index = newlineIndex
      start = newlineIndex + 1
      continue
    }

    const pairedSeparator =
      (character === '&' && command[index + 1] === '&') ||
      (character === '|' && command[index + 1] === '|')
    const ampersandIsRedirection =
      character === '&' &&
      (command[index - 1] === '>' || command[index - 1] === '<' || command[index + 1] === '>')
    const singleSeparator =
      character === ';' ||
      character === '|' ||
      (character === '&' && !ampersandIsRedirection) ||
      /[\r\n]/.test(character)
    if (!pairedSeparator && !singleSeparator) continue

    const segment = command.slice(start, index).trim()
    if (segment.length > 0) segments.push(segment)
    if (pairedSeparator) index += 1
    start = index + 1
  }

  const finalSegment = command.slice(start).trim()
  if (finalSegment.length > 0) segments.push(finalSegment)
  return segments
}

function hasCorrelatedGitCommand(command: string): boolean {
  const segments = commandSegments(command)
  return (
    segments.some(isGitCommand) &&
    segments.every(s => isGitCommand(s) || isShellSetupCommand(s) || isSafeReportingCommand(s))
  )
}

function pathBeforePermissionToken(errorText: string, tokenIndex: number): string | undefined {
  let end = tokenIndex - 1
  while (end >= 0 && /\s/.test(errorText[end]!)) end -= 1
  if (errorText[end] !== ':') return undefined

  end -= 1
  while (end >= 0 && /\s/.test(errorText[end]!)) end -= 1
  if (errorText[end] === "'" || errorText[end] === '"') end -= 1
  if (end < 0) return undefined

  let start = end
  while (start >= 0 && !/[\s'":]/.test(errorText[start]!)) start -= 1
  const path = errorText.slice(start + 1, end + 1)
  return path.length > 0 ? path : undefined
}

export function isGitMetadataPermissionDenial(
  command: string | undefined,
  errorText: string,
): boolean {
  if (command === undefined || !hasCorrelatedGitCommand(command)) return false
  for (const match of errorText.matchAll(PERMISSION_TOKEN)) {
    const lineStart = errorText.lastIndexOf('\n', match.index - 1) + 1
    if (!GIT_DIAGNOSTIC_PREFIX.test(errorText.slice(lineStart, match.index))) continue
    const path = pathBeforePermissionToken(errorText, match.index)
    if (path !== undefined && isGitMetadataPath(path)) return true
  }
  return false
}
