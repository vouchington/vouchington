import { POLICY_GATED_GH_AREAS } from './github-gh-areas.mts'

/** The word's last path segment is exactly `gh` or `gh-stack` (`/usr/bin/gh`, `gh-stack`). */
export function isGhWord(word: string): boolean {
  const name = word.slice(word.lastIndexOf('/') + 1)
  return name === 'gh' || name === 'gh-stack'
}

/** Whether a token literally says `gh`/`gh-stack`, including inside a quoted multi-word payload
 * (`'gh pr merge 1'` tokenizes as one word). */
function mentionsLiteralGh(word: string): boolean {
  return word.split(/\s+/).some(isGhWord)
}

/**
 * Whether an opaque runner's clause (a `find` -exec/-execdir/-ok/-okdir clause, a `parallel`
 * command template) invokes gh: a literal `gh`/`gh-stack` word anywhere in it (including inside a
 * quoted multi-word payload, e.g. a nested `sh -c 'gh pr merge 1'` script), its own executable
 * word — the clause's first word — being an unresolved shell expansion (`$GH`, `` `which gh` ``)
 * that could expand to one, or any word later in the clause that is itself an expansion
 * immediately followed by a gated gh area (`sudo $GH pr merge 1`, `$GH pr merge ::: 1` split
 * across a `parallel` template): those two words are the ones a real gh invocation, or a wrapper
 * ahead of one, would place adjacent, so this catches the executable-word case regardless of which
 * wrapper (`sudo`, an unmodeled `parallel` option) precedes it. Other than that adjacency, later
 * arguments routinely reference unrelated variables (`sh -c 'mv "$1" "$2"'`, `$HOME`) that have
 * nothing to do with which program runs, so checking every word there for a bare expansion would
 * fail closed on ordinary commands.
 */
export function mentionsGhInvocation(words: readonly string[]): boolean {
  if (words.some(mentionsLiteralGh)) return true
  if (words[0] !== undefined && /[$`]/.test(words[0])) return true
  const flat = words.flatMap(word => word.split(/\s+/))
  return flat.some((word, i) => /[$`]/.test(word) && POLICY_GATED_GH_AREAS.has(flat[i + 1] ?? ''))
}
