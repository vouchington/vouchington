// Commands are matched by command position, not by scanning for the words anywhere in
// the string — otherwise an unrelated command that merely passes "no-mistakes"/"git
// push" as an argument (`rg git push .agents`, `echo no-mistakes`) would be counted as
// running it. The string is split into segments on unquoted `;`, `&`, and `|` (so
// compound commands like `git push;gh pr view` or `pnpm run no-mistakes&& git status`
// split correctly even with no surrounding whitespace), and only the first word of a
// segment — or the target of a recognized package-runner prefix (`npx X`, `pnpm run
// X`) — counts as a command. Quoted spans, including any whitespace inside them, are
// grouped into a single word, mirroring real shell tokenization.
export function splitCommandSegments(command: string): string[][] {
  const segments: string[][] = []
  let current: string[] = []
  let word = ''
  let quote: '"' | "'" | null = null

  const flushWord = (): void => {
    if (word) {
      current.push(word)
      word = ''
    }
  }
  const flushSegment = (): void => {
    flushWord()
    if (current.length) {
      segments.push(current)
      current = []
    }
  }

  for (const char of command) {
    if (quote) {
      if (char === quote) quote = null
      else word += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === ';' || char === '&' || char === '|' || char === '\n' || char === '\r') {
      flushSegment()
      continue
    }
    if (/\s/.test(char)) {
      flushWord()
      continue
    }
    word += char
  }
  flushSegment()
  return segments
}

const PACKAGE_RUNNERS = new Set(['npx', 'pnpm', 'pnpx', 'yarn'])
const SHELL_ENVIRONMENT_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

export function isPackageRunner(word: string | undefined): boolean {
  if (!word) return false
  return [...PACKAGE_RUNNERS].some(runner => word === runner || word.endsWith(`/${runner}`))
}

function stripLeadingEnvironmentAssignments(segment: string[]): string[] {
  const commandIndex = segment.findIndex(word => !SHELL_ENVIRONMENT_ASSIGNMENT.test(word))
  return commandIndex === -1 ? [] : segment.slice(commandIndex)
}

export function isNoMistakesInvocation(command: string): boolean {
  return splitCommandSegments(command).some(rawSegment => {
    const segment = stripLeadingEnvironmentAssignments(rawSegment)
    const commandWord = segment[0]
    if (!commandWord) return false
    if (commandWord === 'no-mistakes' || commandWord.endsWith('/no-mistakes')) return true
    if (!isPackageRunner(commandWord)) return false
    const second = segment[1]
    const target = second === 'run' || second === 'exec' ? segment[2] : second
    return target === 'no-mistakes'
  })
}

// Global options come before git's subcommand (`git -C <path> push`, `git -c
// <name>=<value> push`). `-C`/`-c` consume the following token as their value; any
// other `-`-prefixed token (`--no-pager`, `--work-tree=<path>`) is a standalone flag.
// The first non-option token is the subcommand.
const GIT_OPTIONS_WITH_SEPARATE_VALUE = new Set(['-C', '-c'])

function findGitSubcommand(segment: string[]): string | undefined {
  let i = 1
  while (i < segment.length) {
    const token = segment[i]
    if (GIT_OPTIONS_WITH_SEPARATE_VALUE.has(token)) {
      i += 2
      continue
    }
    if (token.startsWith('-')) {
      i += 1
      continue
    }
    return token
  }
  return undefined
}

export function isGitPushInvocation(command: string): boolean {
  return splitCommandSegments(command).some(rawSegment => {
    const segment = stripLeadingEnvironmentAssignments(rawSegment)
    const commandWord = segment[0]
    if (!commandWord) return false
    if (commandWord !== 'git' && !commandWord.endsWith('/git')) return false
    return findGitSubcommand(segment) === 'push'
  })
}
