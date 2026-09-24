import { type OptionGrammar, parseOptions } from './shell-option-grammar.mts'

export const NO_OPTIONS: OptionGrammar = {}

/**
 * npx (npm 7+): `-p/--package <pkg>` and `-c/--call <expr>` are required-argument; the rest of the
 * commonly used flags are modeled so an unrecognized long option never swallows the next word as
 * its value. `--call`'s value is a shell-string payload like eval's, re-scanned by
 * github-wrapper-payloads.mts instead of resolved here — npx has no subcommand of its own, so once
 * its options are consumed the next word (`npx -p gh gh pr merge 1`'s second `gh`) is already in
 * command position without any extra handling.
 */
export const NPX_GRAMMAR: OptionGrammar = {
  aliases: { c: 'call', p: 'package', q: 'quiet', y: 'yes' },
  long: {
    call: 'required',
    'no-install': 'none',
    npm: 'required',
    offline: 'none',
    package: 'required',
    'prefer-offline': 'none',
    'prefer-online': 'none',
    quiet: 'none',
    shell: 'required',
    'shell-auto-fallback': 'optional',
    yes: 'none',
  },
  shortRequiredArgument: 'cp',
}

/**
 * pnpm's argument-taking global options that can appear before `exec` (`pnpm --filter web exec
 * tsc`, `pnpm -C dir exec …`); `--filter=x` already worked before this grammar existed (a
 * self-contained token), but the space-separated form did not, the same failure mode as every
 * other unmodeled required-argument option in this file.
 */
export const PNPM_GRAMMAR: OptionGrammar = {
  aliases: { C: 'dir', F: 'filter' },
  long: {
    dir: 'required',
    filter: 'required',
    'filter-prod': 'required',
    loglevel: 'required',
    reporter: 'required',
    'workspace-root': 'none',
  },
  shortRequiredArgument: 'CF',
}

/** mise's global options that can appear before `exec`/`x` (`mise -C dir exec -- gh …`). */
export const MISE_GRAMMAR: OptionGrammar = {
  aliases: { C: 'cd' },
  long: { cd: 'required' },
  shortRequiredArgument: 'C',
}

// mise exec's own options once inside the subcommand, notably `-c/--command <string>`: unlike the
// `exec TOOL@VERSION... -- COMMAND` shape (modeled as a normal wrapper chain in
// shell-wrapper-exec-grammars.mts via `operandsUntilDoubleDash`), the `-c`/`--command` shape has no
// `--` at all, so it cannot be resolved the same way — its value is a shell-string payload, found
// by miseExecCommandValue below and re-scanned like eval's.
const MISE_EXEC_GRAMMAR: OptionGrammar = {
  aliases: { C: 'cd', c: 'command', e: 'env', j: 'jobs' },
  long: { cd: 'required', command: 'required', env: 'required', jobs: 'required', raw: 'none' },
  shortRequiredArgument: 'Ccej',
}

const MISE_EXEC_SUBCOMMANDS = new Set(['exec', 'x'])

/**
 * Independently walks mise's global options, its `exec`/`x` subcommand, and that subcommand's own
 * options, to find a `-c`/`--command` value — the one mise exec shape `parseCommandPrefix` cannot
 * resolve (shell-wrapper-subcommand.mts's `operandsUntilDoubleDash` handling needs a literal `--`
 * this shape never has). Used both to extract the payload (github-wrapper-payloads.mts) and, by
 * the opaque-gh safety net, to recognize this shape as already handled instead of raising its own
 * generic block.
 */
export function miseExecCommandValue(args: readonly string[]): string | undefined {
  const globalParsed = parseOptions(args, 0, MISE_GRAMMAR)
  if (globalParsed === null) return undefined
  if (!MISE_EXEC_SUBCOMMANDS.has(args[globalParsed.next])) return undefined
  const execParsed = parseOptions(args, globalParsed.next + 1, MISE_EXEC_GRAMMAR)
  return execParsed?.options.find(option => option.name === 'command')?.value
}
