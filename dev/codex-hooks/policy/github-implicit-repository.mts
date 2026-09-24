import { checkoutOwner, ownerOfRepoSelector } from './github-checkout-owners.mts'
import { commandPrefixAt, commandSegmentStart } from './github-command-position.mts'
import { isShellAssignment } from './shell-token-utils.mts'

// The prefix words that only set or unset gh's environment: `env` and `command` themselves and
// `env`'s unset forms. Any other `env` option (`-i`, `-`, `-C`, `-S`) or wrapper clears the
// environment, moves the directory, or rewrites the command, so it never proves gh's target.
const MODELED_PREFIX_WORD = /^(?:env|command|-u.+|--unset=.+)$/
const GIT_VARIABLE = /^GIT_[A-Z\d_]*=/

/**
 * The GitHub owner gh resolves without `--repo`: a non-empty `GH_REPO`, else the cwd's remotes —
 * or undefined unless the hook provably sees what gh will. gh's own prefix may only set or unset
 * variables, and the inherited `GH_REPO` and `cwd` count only for a top-level gh reached through
 * nothing but `&&`-joined literal `cd`s, with no `GIT_*` prefix for the cwd.
 */
export function implicitRepositoryOwner(
  tokens: string[],
  index: number,
  isTopLevelCommand: boolean,
  cwd: string | undefined,
): string | undefined {
  const prefix = tokens.slice(commandSegmentStart(tokens, index), index)
  const env = commandPrefixAt(tokens, index)?.env
  if (env === undefined || !prefixOnlySetsVariables(prefix)) {
    return undefined
  }
  const prefixSetsGhRepo = 'GH_REPO' in env
  const inherited = isTopLevelCommand && followsOnlyChainedCds(tokens, index)
  if (!prefixSetsGhRepo && !inherited) {
    return undefined
  }
  const ghRepo = prefixSetsGhRepo ? env.GH_REPO : process.env.GH_REPO
  if (ghRepo !== undefined && ghRepo !== '') {
    return ownerOfRepoSelector(ghRepo)
  }
  const cwdIsProven = inherited && cwd !== undefined && !prefix.some(isGitVariable)
  return cwdIsProven ? checkoutOwner(cwd) : undefined
}

function prefixOnlySetsVariables(prefix: string[]): boolean {
  for (let cursor = 0; cursor < prefix.length; cursor += 1) {
    const word = prefix[cursor]
    if ((word === '-u' || word === '--unset') && cursor + 1 < prefix.length) {
      cursor += 1
    } else if (!isShellAssignment(word) && !MODELED_PREFIX_WORD.test(word)) {
      return false
    }
  }
  return true
}

// gh provably inherits the hook's view of the shell — the hook's GH_REPO and commandCwd's
// directory, which models only sequential literal `cd`s — only when every command before gh is such
// a `cd`, joined by `&&`, so gh runs only if each one did. Any other command or joiner (`;` after a
// short-circuit, `||`, a zsh pipeline's last `cd`, `eval`, a function, `builtin cd`, `pushd`,
// `source`, a same-command `git remote set-url`) can leave gh with a directory, remote, or
// environment the hook didn't read.
function followsOnlyChainedCds(tokens: string[], index: number): boolean {
  for (let start = commandSegmentStart(tokens, index); start > 0;) {
    if (tokens[start - 1] !== '&&') {
      return false
    }
    start = commandSegmentStart(tokens, start - 1)
    if (tokens[start] !== 'cd') {
      return false
    }
  }
  return true
}

function isGitVariable(word: string): boolean {
  return GIT_VARIABLE.test(word)
}
