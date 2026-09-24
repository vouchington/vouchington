import { type ParsedOption, parseOptions } from './shell-option-grammar.mts'
import { isShellRedirectionOperatorToken } from './shell-redirections.mts'
import { isShellAssignment, plainShellAssignment } from './shell-token-utils.mts'
import { WRAPPERS } from './shell-wrapper-grammars.mts'

/** What a recognized wrapper chain before a command word changes about how that command runs. */
export type CommandPrefix = {
  /** The effective `env -C` directory of each `env` in the chain, outermost first. */
  chdir: string[]
  /** Assignments and `env -u` unsets the command sees. */
  env: Record<string, string | undefined>
  /** An `env -S` string can carry its own `-C`, so the command's cwd is unknown. */
  splitString: boolean
  /** Wrapper basenames, outermost first. */
  wrappers: string[]
  /** `xargs` replacement strings (`-I`, `-i`, `-J`, `--replace`) that stdin items fill in. */
  xargsReplacements: string[]
}

// Reserved words that may open a simple command without choosing which program it runs.
const SHELL_CONTROL_PREFIXES = new Set([
  '!',
  '{',
  'coproc',
  'do',
  'elif',
  'else',
  'if',
  'then',
  'until',
  'while',
])
// Control prefixes that open a compound command whose first command follows in the same segment.
const COMPOUND_OPENERS = new Set(['{', 'if', 'until', 'while'])

/**
 * Parses the words between a command segment's start and a command word. Returns null when they
 * are not a recognized wrapper chain, i.e. the command word is an argument rather than the
 * program the shell runs. Wrappers chain in any order (`nohup env -C /tmp timeout 5 gh`) and match
 * by basename (`/usr/bin/env`).
 */
export function parseCommandPrefix(prefixWords: readonly string[]): CommandPrefix | null {
  const words = withoutRedirections(prefixWords)
  if (words === null) return null
  const read = readCommandPrefix(words)
  return read?.commandIndex === words.length ? read.prefix : null
}

/**
 * Reads the wrapper chain that opens a simple command's words (redirections already removed) and
 * finds the command word it runs. `commandIndex` is `words.length` when the chain consumes every
 * word, as `env -S 'bash -s'` does. Returns null when a wrapper's options are malformed or only
 * describe the command (`command -v gh`).
 */
export function readCommandPrefix(
  words: readonly string[],
): { commandIndex: number; prefix: CommandPrefix } | null {
  const prefix: CommandPrefix = {
    chdir: [],
    env: {},
    splitString: false,
    wrappers: [],
    xargsReplacements: [],
  }
  let controlAllowed = true
  let cursor = 0
  while (cursor < words.length) {
    const word = words[cursor]
    if (isShellAssignment(word)) {
      const assignment = plainShellAssignment(word)
      if (assignment !== null) prefix.env[assignment.name] = assignment.value
      cursor += 1
      continue
    }
    // `function NAME` and bash's `coproc NAME` before a compound command (`coproc m { gh …; }`).
    if (
      controlAllowed &&
      (word === 'function' || (word === 'coproc' && COMPOUND_OPENERS.has(words[cursor + 2]))) &&
      cursor + 1 < words.length
    ) {
      cursor += 2
      continue
    }
    if (controlAllowed && SHELL_CONTROL_PREFIXES.has(word)) {
      cursor += 1
      continue
    }
    const name = word.slice(word.lastIndexOf('/') + 1)
    const wrapper = WRAPPERS.get(name)
    if (wrapper === undefined) return { commandIndex: cursor, prefix }
    const parsed = parseOptions(words, cursor + 1, wrapper.grammar)
    if (parsed === null || parsed.options.some(option => wrapper.describeOnly?.has(option.name))) {
      return null
    }
    let next = parsed.next
    if (wrapper.subcommand !== undefined) {
      if (words[next] !== wrapper.subcommand) return null
      next += 1
      if (wrapper.subcommandGrammar !== undefined) {
        const subParsed = parseOptions(words, next, wrapper.subcommandGrammar)
        if (subParsed === null) return null
        next = subParsed.next
      }
    }
    if (wrapper.operandsUntilDoubleDash === true) {
      const dashIndex = words.indexOf('--', next)
      if (dashIndex === -1) return null
      next = dashIndex + 1
    }
    cursor = next + (wrapper.operands ?? 0)
    if (cursor > words.length) return null
    applyWrapperOptions(prefix, name, parsed.options)
    prefix.wrappers.push(name)
    // The `time` keyword times a whole pipeline, so `time ! gh` is still a command.
    controlAllowed = name === 'time'
  }

  return { commandIndex: words.length, prefix }
}

// The shell applies redirections itself and drops each operator and its target from the argv the
// command (or wrapper) receives, wherever they appear: `2>/dev/null env -C /tmp gh` runs env with
// `-C /tmp gh`. A trailing operator's target is the command word, so that word is not a command.
export function withoutRedirections(words: readonly string[]): string[] | null {
  const argv: string[] = []
  for (let index = 0; index < words.length; index += 1) {
    if (!isShellRedirectionOperatorToken(words[index])) {
      argv.push(words[index])
    } else if (index + 1 === words.length) {
      return null
    } else {
      index += 1
    }
  }
  return argv
}

function applyWrapperOptions(prefix: CommandPrefix, name: string, options: ParsedOption[]): void {
  let chdir: string | undefined
  for (const option of options) {
    if (name === 'xargs' && option.name === 'replace') {
      prefix.xargsReplacements.push(option.value ?? '{}')
    }
    if (name !== 'env') continue
    if (option.name === 'chdir') chdir = option.value
    if (option.name === 'unset' && option.value !== undefined) prefix.env[option.value] = undefined
    if (option.name === 'split-string') prefix.splitString = true
  }
  // GNU and BSD env keep only the last -C, relative to the directory env started in.
  if (chdir !== undefined) prefix.chdir.push(chdir)
}
