import type { OptionGrammar } from './shell-option-grammar.mts'
import {
  MISE_GRAMMAR,
  NO_OPTIONS,
  NPX_GRAMMAR,
  PNPM_GRAMMAR,
} from './shell-wrapper-package-runner-grammars.mts'
import type { Wrapper } from './shell-wrapper-grammars.mts'
import { SUDO_GRAMMAR } from './shell-wrapper-sudo-grammar.mts'

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

/**
 * script(1): BSD record mode has -aeFkqr as flags and one trailing FILE operand before the wrapped
 * command (`script -q /dev/null gh …`). The GitHub Actions runner this hook protects is Linux,
 * whose util-linux script(1) additionally has `-c/--command <string>` (a shell-string payload like
 * eval's, re-scanned by github-wrapper-payloads.mts instead of resolved here) and its own
 * required-argument options (-T/--log-timing, -O/--log-out, -I/--log-in, -B/--log-io,
 * -m/--logging-format, -E/--echo, -o/--output-limit). `-t` is modeled as util-linux's deprecated,
 * optional, attached-only `-t[file]` (never the next word) rather than BSD's required,
 * space-separated `-t time`: the two are genuinely incompatible under one letter, and getting this
 * one wrong the other way round is what let `-t -c "gh …"` swallow `-c`'s value as `-t`'s, stranding
 * the disguised gh command where the resolved wrapper chain no longer scans it. A bare BSD `-t
 * TIME` (unattached) still parses under this grammar — `-t` just takes no value, so `TIME` is
 * misread as script's own FILE operand instead — landing the resolved position one word early, on
 * the real FILE operand rather than the wrapped command. That is still before the wrapped command,
 * so the exec-wrapper safety net (github-exec-wrapper-mention-policy.mts) still scans over it and
 * catches a `gh` mention there, but only with its generic reason, and only because a gated area word
 * (e.g. `pr`) follows `gh` — so a real, allowed `script -t 0 /dev/null gh pr view 1` also blocks.
 * Accepted: closing the util-linux `-t[file]` silent-allow gap is worth this BSD false positive.
 */
export const SCRIPT_GRAMMAR: OptionGrammar = {
  aliases: {
    B: 'log-io',
    c: 'command',
    E: 'echo',
    I: 'log-in',
    m: 'logging-format',
    O: 'log-out',
    o: 'output-limit',
  },
  long: {
    command: 'required',
    echo: 'required',
    'log-in': 'required',
    'log-io': 'required',
    'log-out': 'required',
    'log-timing': 'required',
    'logging-format': 'required',
    'output-limit': 'required',
  },
  shortOptionalArgument: 't',
  shortRequiredArgument: 'TcIOBmEo',
}

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
 *
 * `pnpm exec` and `mise exec`/`mise x` model their own argument-taking global options
 * (`PNPM_GRAMMAR`, `MISE_GRAMMAR`) so a space-separated `--dir x`/`-C x` before the subcommand does
 * not strand the subcommand word as an unrecognized one; `pnpm`'s `subcommandGrammar` is
 * `NO_OPTIONS` only so a bare `--` right after `exec` is consumed the same way any other wrapper's
 * options consume it (shell-option-grammar.mts's `--` handling applies before any grammar-specific
 * table lookup, so an empty grammar still recognizes it). `mise exec -c/--command STRING` — which
 * has no `--` at all — is not resolvable through this table's `operandsUntilDoubleDash`, and is
 * instead handled as a separate payload (`miseExecCommandValue`,
 * shell-wrapper-package-runner-grammars.mts).
 */
export const EXEC_WRAPPER_ENTRIES: readonly (readonly [string, Wrapper])[] = [
  ['sudo', { grammar: SUDO_GRAMMAR }],
  ['stdbuf', { grammar: STDBUF_GRAMMAR }],
  ['caffeinate', { grammar: CAFFEINATE_GRAMMAR }],
  ['unbuffer', { grammar: NO_OPTIONS }],
  ['setsid', { grammar: NO_OPTIONS }],
  ['arch', { grammar: ARCH_GRAMMAR }],
  ['script', { grammar: SCRIPT_GRAMMAR, operands: 1 }],
  ['npx', { grammar: NPX_GRAMMAR }],
  ['pnpm', { grammar: PNPM_GRAMMAR, subcommand: ['exec'], subcommandGrammar: NO_OPTIONS }],
  ['mise', { grammar: MISE_GRAMMAR, operandsUntilDoubleDash: true, subcommand: ['exec', 'x'] }],
]
