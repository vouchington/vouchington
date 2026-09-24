import type { OptionGrammar } from './shell-option-grammar.mts'

export type Wrapper = {
  /** Options that make the wrapper describe the command instead of running it (`command -v`). */
  describeOnly?: ReadonlySet<string>
  grammar: OptionGrammar
  /** Operands between the options and the wrapped command (`timeout DURATION`). */
  operands?: number
}

const NO_OPTIONS: OptionGrammar = {}

/** GNU and BSD env: every option either implementation gives an argument takes one here. */
export const ENV_GRAMMAR: OptionGrammar = {
  aliases: { C: 'chdir', S: 'split-string', a: 'argv0', i: 'ignore-environment', u: 'unset' },
  loneDash: 'ignore-environment',
  long: {
    argv0: 'required',
    'block-signal': 'optional',
    chdir: 'required',
    debug: 'none',
    'default-signal': 'optional',
    help: 'none',
    'ignore-environment': 'none',
    'ignore-signal': 'optional',
    'list-signal-handling': 'none',
    null: 'none',
    'split-string': 'required',
    unset: 'required',
    version: 'none',
  },
  shortRequiredArgument: 'aCPSu',
}

// GNU xargs and BSD xargs (`-J`, `-R`, `-S`) option grammars merged.
const XARGS_GRAMMAR: OptionGrammar = {
  aliases: { I: 'replace', J: 'replace', i: 'replace' },
  long: {
    'arg-file': 'required',
    delimiter: 'required',
    eof: 'optional',
    exit: 'none',
    help: 'none',
    interactive: 'none',
    'max-args': 'required',
    'max-chars': 'required',
    'max-lines': 'optional',
    'max-procs': 'required',
    'no-run-if-empty': 'none',
    null: 'none',
    'open-tty': 'none',
    'process-slot-var': 'required',
    replace: 'optional',
    'show-limits': 'none',
    verbose: 'none',
    version: 'none',
  },
  shortOptionalArgument: 'eil',
  shortRequiredArgument: 'adEIJLnPRSs',
}

/**
 * Programs and builtins that run their operand as a command, so the word after them (and after
 * their own options and operands) is still in command position. Any other command's later words
 * are arguments. Grammars are the GNU and BSD unions so no argument is mistaken for the command.
 */
export const WRAPPERS: ReadonlyMap<string, Wrapper> = new Map<string, Wrapper>([
  // zsh precommand modifiers: `- gh`, `nocorrect gh`, `noglob gh`.
  ['-', { grammar: NO_OPTIONS }],
  ['builtin', { grammar: NO_OPTIONS }],
  ['command', { describeOnly: new Set(['v', 'V']), grammar: NO_OPTIONS }],
  ['env', { grammar: ENV_GRAMMAR }],
  ['exec', { grammar: { shortRequiredArgument: 'a' } }],
  [
    'nice',
    {
      grammar: {
        long: { adjustment: 'required', help: 'none', version: 'none' },
        numeric: 'adjustment',
        shortRequiredArgument: 'n',
      },
    },
  ],
  ['nocorrect', { grammar: NO_OPTIONS }],
  ['noglob', { grammar: NO_OPTIONS }],
  ['nohup', { grammar: NO_OPTIONS }],
  ['rtk', { grammar: NO_OPTIONS }],
  [
    'time',
    {
      grammar: {
        long: {
          append: 'none',
          format: 'required',
          help: 'none',
          output: 'required',
          portability: 'none',
          quiet: 'none',
          verbose: 'none',
          version: 'none',
        },
        shortRequiredArgument: 'fo',
      },
    },
  ],
  [
    'timeout',
    {
      grammar: {
        long: {
          foreground: 'none',
          help: 'none',
          'kill-after': 'required',
          'preserve-status': 'none',
          signal: 'required',
          verbose: 'none',
          version: 'none',
        },
        shortRequiredArgument: 'ks',
      },
      operands: 1,
    },
  ],
  ['xargs', { grammar: XARGS_GRAMMAR }],
])
