import type { BlockDecision } from './core.mts'
import { POLICY_GATED_GH_AREAS } from './github-gh-areas.mts'
import { parseCommandPrefix } from './shell-command-wrappers.mts'
import { isGhWord } from './shell-gh-word.mts'
import { shellScriptOperandIndex } from './shell-script-operand.mts'
import { nextShellCommandSeparatorIndex } from './shell-token-utils.mts'
import { EXEC_WRAPPER_ENTRIES } from './shell-wrapper-exec-grammars.mts'
import { miseExecCommandValue } from './shell-wrapper-package-runner-grammars.mts'

const GITHUB_POLICIES =
  'the GitHub policies (draft-first PRs, merge authority, the gh stack allowlist)'

// Scoped to the exec-style runners this change adds or extends (sudo, stdbuf, caffeinate,
// unbuffer, setsid, arch, script, npx, pnpm, mise), not #432's original wrappers (env, timeout,
// nice, nohup, xargs, …): those already have complete grammars, and several of them deliberately
// consume a literal `gh` as their own option or operand value in existing, passing tests (`env -u
// gh pr merge 1` unsets a variable named `gh`; `timeout gh pr merge 1` treats `gh` as the
// duration) — scanning past a wrapper this hook already fully understands would fail closed on
// those, for a wrapper that has no modeling gap to hide behind.
export const EXEC_STYLE_WRAPPER_NAMES: ReadonlySet<string> = new Set(
  EXEC_WRAPPER_ENTRIES.map(([name]) => name),
)

/**
 * A fail-closed backstop for one of the exec-style wrappers above whose own chain either does not
 * fully parse or resolves to a word that is not gh, while a literal `gh` word still sits somewhere
 * after that resolved point, immediately followed by a policy-gated area
 * (`POLICY_GATED_GH_AREAS`). A wrapper's own grammar is the precise mechanism (it produces the
 * real, specific policy reason, e.g. `MERGE_BLOCK`); this only catches what that grammar does not
 * yet model — an unmodeled argument-taking option that strands its value where the wrapper chain
 * expected the next wrapper or the command, the same failure this whole change fixes for sudo,
 * npx, pnpm, mise, and script, for every option this hook has not (yet) been taught. The scan
 * starts only after the resolved point (not right after the wrapper's own name), so a wrapper's
 * own, already-consumed option value never counts, the same reason #432's originals are excluded
 * outright.
 *
 * Two shapes are excluded before the scan, because each is already, separately and correctly,
 * re-checked as its own candidate command elsewhere in the pipeline, and firing here first would
 * pre-empt that more precise check (github-command-context.mts always scans the original,
 * unmodified command before any extracted candidate): a `bash`/`sh`/`zsh -c` script the wrapper
 * chain resolves to (shell-commands.mts already re-scans it independent of any wrapper prefix), and
 * a `mise exec`/`mise x -c/--command` value (github-wrapper-payloads.mts already extracts it, the
 * one shape `operandsUntilDoubleDash` cannot resolve on its own since it requires a literal `--`
 * this shape never has). `npx -c/--call` and `script -c/--command` need no such exclusion: both
 * grammars fully consume the option and its value, so nothing is left to scan.
 */
export function findExecWrapperMentionBlock(tokens: string[], index: number): BlockDecision | null {
  const name = basename(tokens[index])
  if (!EXEC_STYLE_WRAPPER_NAMES.has(name)) return null
  const end = nextShellCommandSeparatorIndex(tokens, index + 1)
  const resolvedIndex = resolvedCommandIndex(tokens, index, end)
  if (resolvedIndex !== undefined) {
    if (resolvedIndex >= end) return null
    if (isGhWord(tokens[resolvedIndex])) return null
    if (shellScriptOperandIndex(tokens, resolvedIndex) !== undefined) return null
  }
  if (name === 'mise' && miseExecCommandValue(tokens.slice(index + 1, end)) !== undefined) {
    return null
  }
  // A subcommand-taking wrapper (pnpm, mise) whose own global options do not fully parse — an
  // option this hook has not modeled, e.g. pnpm's `--registry` or mise's `--env` — never reaches a
  // resolved point at all (unlike sudo/npx/script, which have no subcommand and so always resolve
  // to something): `resolvedCommandIndex` returns undefined instead of a stuck-but-defined
  // position. That is maximum uncertainty, not a reason to trust the command, so the scan covers
  // everything after the wrapper's own name rather than being skipped.
  const scanStart = resolvedIndex ?? index + 1
  if (!mentionsGhBeforeGatedArea(tokens.slice(scanStart, end))) return null
  return {
    reason: `\`${name}\` can run a gh command the hook cannot check against ${GITHUB_POLICIES} without separately running ${name}. Run gh directly with a literal subcommand instead.`,
  }
}

// The largest `candidate` for which everything from `start` up to (excluding) `candidate` parses
// as a wrapper chain (assignments, control prefixes, and `WRAPPERS` entries alike, chained in any
// order — the same rule commandPrefixAt uses), i.e. the position right after that chain, or
// undefined when even the wrapper's own bare name does not (an inner redirection with no target).
function resolvedCommandIndex(
  tokens: readonly string[],
  start: number,
  end: number,
): number | undefined {
  let resolved: number | undefined
  for (let candidate = start + 1; candidate <= end; candidate += 1) {
    if (parseCommandPrefix(tokens.slice(start, candidate)) !== null) resolved = candidate
  }
  return resolved
}

// Whether the words (including inside a quoted multi-word word) contain a literal gh word
// immediately followed by a policy-gated area, the same adjacency `find`'s and `parallel`'s clause
// scan uses (shell-gh-word.mts) for an expansion in command position.
function mentionsGhBeforeGatedArea(words: readonly string[]): boolean {
  const flat = words.flatMap(word => word.split(/\s+/))
  return flat.some((word, i) => isGhWord(word) && POLICY_GATED_GH_AREAS.has(flat[i + 1] ?? ''))
}

function basename(word: string): string {
  return word.slice(word.lastIndexOf('/') + 1)
}
