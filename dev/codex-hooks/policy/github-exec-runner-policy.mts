import type { BlockDecision } from './core.mts'
import { mentionsGhInvocation } from './shell-gh-word.mts'
import { nextShellCommandSeparatorIndex } from './shell-token-utils.mts'

const GITHUB_POLICIES =
  'the GitHub policies (draft-first PRs, merge authority, the gh stack allowlist)'
const EXEC_CLAUSE_FLAGS = new Set(['-exec', '-execdir', '-ok', '-okdir'])

const FIND_EXEC_BLOCK: BlockDecision = {
  reason: `\`find\`'s -exec/-execdir/-ok/-okdir clause can run a gh command the hook cannot check against ${GITHUB_POLICIES} without separately running find. Run gh directly with a literal subcommand instead.`,
}
const PARALLEL_BLOCK: BlockDecision = {
  reason: `\`parallel\` can run a gh command the hook cannot check against ${GITHUB_POLICIES} without separately running parallel. Run gh directly with a literal subcommand instead.`,
}

/**
 * `find`'s -exec/-execdir/-ok/-okdir clause runs an arbitrary command the token scan cannot
 * separate from find's own predicates. A clause that mentions gh is checked like xargs: fail
 * closed instead of guessing what it runs. The clause itself ends at its own `;`/`+` terminator,
 * but the outer scan for another `-exec`-family flag is unbounded rather than stopping at the
 * first one found: an escaped `\;` terminating one clause tokenizes identically to a real `;`
 * (shell-tokenizer.mts), so bounding it would risk stopping before a later `-exec` clause instead.
 */
export function findFindExecOpaqueBlock(tokens: string[], index: number): BlockDecision | null {
  if (basename(tokens[index]) !== 'find') return null
  for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
    if (!EXEC_CLAUSE_FLAGS.has(tokens[cursor])) continue
    let end = cursor + 1
    while (end < tokens.length && tokens[end] !== ';' && tokens[end] !== '+') end += 1
    if (mentionsGhInvocation(tokens.slice(cursor + 1, end))) return FIND_EXEC_BLOCK
    cursor = end
  }
  return null
}

/**
 * `parallel` runs its command template once per input the token scan never sees, so a template
 * that mentions gh is checked like xargs: fail closed instead of guessing what it runs.
 */
export function findParallelOpaqueBlock(tokens: string[], index: number): BlockDecision | null {
  if (basename(tokens[index]) !== 'parallel') return null
  const end = nextShellCommandSeparatorIndex(tokens, index + 1)
  return mentionsGhInvocation(tokens.slice(index + 1, end)) ? PARALLEL_BLOCK : null
}

function basename(word: string): string {
  return word.slice(word.lastIndexOf('/') + 1)
}
