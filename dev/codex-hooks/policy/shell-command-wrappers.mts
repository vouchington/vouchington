import { type ParsedOption, parseOptions } from './shell-option-grammar.mts'
import { isShellRedirectionOperatorToken } from './shell-redirections.mts'
import { isShellAssignment } from './shell-token-utils.mts'
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

/**
 * Parses the words between a command segment's start and a command word. Returns null when they
 * are not a recognized wrapper chain, i.e. the command word is an argument rather than the
 * program the shell runs. Wrappers chain in any order (`nohup env -C /tmp timeout 5 gh`) and match
 * by basename (`/usr/bin/env`).
 */
export function parseCommandPrefix(prefixWords: readonly string[]): CommandPrefix | null {
  const words = withoutRedirections(prefixWords)
  if (words === null) return null
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
      const equalsIndex = word.indexOf('=')
      prefix.env[word.slice(0, equalsIndex)] = word.slice(equalsIndex + 1)
      cursor += 1
      continue
    }
    if (controlAllowed && word === 'function' && cursor + 1 < words.length) {
      cursor += 2
      continue
    }
    if (controlAllowed && SHELL_CONTROL_PREFIXES.has(word)) {
      cursor += 1
      continue
    }
    const name = word.slice(word.lastIndexOf('/') + 1)
    const wrapper = WRAPPERS.get(name)
    if (wrapper === undefined) return null
    const parsed = parseOptions(words, cursor + 1, wrapper.grammar)
    if (parsed === null || parsed.options.some(option => wrapper.describeOnly?.has(option.name))) {
      return null
    }
    cursor = parsed.next + (wrapper.operands ?? 0)
    if (cursor > words.length) return null
    applyWrapperOptions(prefix, name, parsed.options)
    prefix.wrappers.push(name)
    // The `time` keyword times a whole pipeline, so `time ! gh` is still a command.
    controlAllowed = name === 'time'
  }

  return prefix
}

// The shell applies redirections itself and drops each operator and its target from the argv the
// command (or wrapper) receives, wherever they appear: `2>/dev/null env -C /tmp gh` runs env with
// `-C /tmp gh`. A trailing operator's target is the command word, so that word is not a command.
function withoutRedirections(words: readonly string[]): string[] | null {
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
