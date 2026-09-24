import type { OptionGrammar } from './shell-option-grammar.mts'
import type { Wrapper } from './shell-wrapper-grammars.mts'

const NO_OPTIONS: OptionGrammar = {}

// sudo(8) getopt string: Aa:bC:c:D:Eeg:Hh::iKklnPp:R:r:SsT:t:U:u:Vv
const SUDO_GRAMMAR: OptionGrammar = {
  shortOptionalArgument: 'h',
  shortRequiredArgument: 'aCcDgpRTU',
}

// stdbuf(1): -i/-o/-e (or --input/--output/--error) FILE, each required.
const STDBUF_GRAMMAR: OptionGrammar = {
  aliases: { e: 'error', i: 'input', o: 'output' },
  long: { error: 'required', help: 'none', input: 'required', output: 'required', version: 'none' },
  shortRequiredArgument: 'eio',
}

// caffeinate(8): -disu are flags, -t TIMEOUT and -w PID are required.
const CAFFEINATE_GRAMMAR: OptionGrammar = { shortRequiredArgument: 'tw' }

// arch(1): -c/-h are flags, -d envname and -e envname=value are required; the architecture
// selectors (-arch NAME, -i386, -x86_64, -x86_64h, -arm64, -arm64e, -32, -64) and -help are
// single-dash long options, distinct from a cluster of short letters.
const ARCH_GRAMMAR: OptionGrammar = {
  shortRequiredArgument: 'de',
  singleDashLong: {
    '32': 'none',
    '64': 'none',
    arch: 'required',
    arm64: 'none',
    arm64e: 'none',
    help: 'none',
    i386: 'none',
    x86_64: 'none',
    x86_64h: 'none',
  },
}

// script(1) BSD record mode: -aeFkqr are flags, -t time and -T fmt are required; the script's own
// FILE is the one operand before the wrapped command (`script -q /dev/null gh …`).
const SCRIPT_GRAMMAR: OptionGrammar = { shortRequiredArgument: 'tT' }

// GNU watch: -n/--interval SECONDS is required, -d/--differences is optionally attached; the rest
// are flags. Shared with the `watch` payload re-parser (github-wrapper-payloads.mts).
export const WATCH_GRAMMAR: OptionGrammar = {
  aliases: {
    b: 'beep',
    c: 'color',
    d: 'differences',
    e: 'errexit',
    g: 'chgexit',
    n: 'interval',
    p: 'precise',
    t: 'no-title',
    x: 'exec',
  },
  long: {
    beep: 'none',
    chgexit: 'none',
    color: 'none',
    differences: 'optional',
    errexit: 'none',
    exec: 'none',
    help: 'none',
    interval: 'required',
    'no-title': 'none',
    precise: 'none',
    version: 'none',
  },
  shortOptionalArgument: 'd',
  shortRequiredArgument: 'n',
}

/**
 * Wrapper entries for exec-style runners outside the #432 grammar, kept apart from
 * shell-wrapper-grammars.mts to stay under the file's line cap. `unbuffer` and `setsid` take no
 * argument-bearing option this hook needs to model (every option either program defines is a
 * flag), so they use `NO_OPTIONS`: an unrecognized option still parses safely as a flag.
 * `pnpm exec` and `mise exec --` deliberately do not model pnpm's or mise's own argument-taking
 * global flags before `exec` (`pnpm --filter X exec`, `pnpm -C dir exec`, `mise -C dir exec`): the
 * subcommand check below only matches `words[next]`, so these are safely missed, never falsely
 * blocked — a real invocation is just not yet recognized as one.
 */
export const EXEC_WRAPPER_ENTRIES: readonly (readonly [string, Wrapper])[] = [
  ['sudo', { grammar: SUDO_GRAMMAR }],
  ['stdbuf', { grammar: STDBUF_GRAMMAR }],
  ['caffeinate', { grammar: CAFFEINATE_GRAMMAR }],
  ['unbuffer', { grammar: NO_OPTIONS }],
  ['setsid', { grammar: NO_OPTIONS }],
  ['arch', { grammar: ARCH_GRAMMAR }],
  ['script', { grammar: SCRIPT_GRAMMAR, operands: 1 }],
  ['npx', { grammar: NO_OPTIONS }],
  ['pnpm', { grammar: NO_OPTIONS, subcommand: 'exec' }],
  ['mise', { grammar: NO_OPTIONS, operandsUntilDoubleDash: true, subcommand: 'exec' }],
]
