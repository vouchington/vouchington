import { checkoutRepository } from './github-checkout-repositories.mts'
import { commandPrefixAt, commandSegmentStart } from './github-command-position.mts'
import { repositoryOfRepoSelector } from './github-repository-identities.mts'
import {
  followsOnlyChainedCds,
  githubHostAllowsCheckout,
  githubHostIsProven,
  prefixOnlySetsVariables,
} from './github-command-host.mts'

// The prefix words that only set or unset gh's environment: `env` and `command` themselves and
// `env`'s unset forms. Any other `env` option (`-i`, `-`, `-C`, `-S`) or wrapper clears the
// environment, moves the directory, or rewrites the command, so it never proves gh's target.
const GIT_VARIABLE = /^GIT_[A-Z\d_]*=/

/**
 * The GitHub repository gh resolves without `--repo`: a non-empty `GH_REPO`, else the cwd's remotes —
 * or undefined unless the hook provably sees what gh will. gh's own prefix may only set or unset
 * variables, and the inherited `GH_REPO` and `cwd` count only for a top-level gh reached through
 * nothing but `&&`-joined literal `cd`s, with no Git or config-root override for the cwd.
 */
export function implicitRepository(
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
    return invocationRepositorySelector(ghRepo, tokens, index, isTopLevelCommand)
  }
  const cwdIsProven = inherited && cwd !== undefined && !Object.keys(env).some(isGitContextOverride)
  if (!cwdIsProven) return undefined
  const repository = checkoutRepository(cwd)
  return repository !== undefined && githubHostAllowsCheckout(tokens, index, isTopLevelCommand)
    ? repository
    : undefined
}

// Explicit hosts override GH_HOST; a hostless selector needs the effective host proven too.
export function invocationRepositorySelector(
  selector: string,
  tokens: string[],
  index: number,
  isTopLevelCommand: boolean,
): string | undefined {
  const repository = repositoryOfRepoSelector(selector)
  const hasHost =
    selector
      .replace(/^https?:\/\//i, '')
      .replace(/\/$/, '')
      .split('/').length === 3
  return hasHost || githubHostIsProven(tokens, index, isTopLevelCommand) ? repository : undefined
}

// gh provably inherits the hook's view of the shell — the hook's GH_REPO and commandCwd's
// directory, which models only sequential literal `cd`s — only when every command before gh is such
// a `cd`, joined by `&&`, so gh runs only if each one did. Any other command or joiner (`;` after a
// short-circuit, `||`, a zsh pipeline's last `cd`, `eval`, a function, `builtin cd`, `pushd`,
// `source`, a same-command `git remote set-url`) can leave gh with a directory, remote, or
// environment the hook didn't read.
function isGitContextOverride(name: string): boolean {
  return GIT_VARIABLE.test(`${name}=`) || /^(?:HOME|XDG_CONFIG_HOME)$/.test(name)
}
