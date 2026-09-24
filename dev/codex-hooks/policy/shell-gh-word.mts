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
 * quoted multi-word payload, e.g. a nested `sh -c 'gh pr merge 1'` script), or its own executable
 * word — the clause's first word — being an unresolved shell expansion (`$GH`, `` `which gh` ``)
 * that could expand to one. Only the executable word is checked for an expansion: later arguments
 * routinely reference unrelated variables (`sh -c 'mv "$1" "$2"'`, `$HOME`) that have nothing to
 * do with which program runs, so checking every word there would fail closed on ordinary commands.
 */
export function mentionsGhInvocation(words: readonly string[]): boolean {
  return words.some(mentionsLiteralGh) || (words[0] !== undefined && /[$`]/.test(words[0]))
}
