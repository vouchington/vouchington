import type { BlockDecision } from './core.mts'
import { POLICY_GATED_GH_AREAS } from './github-gh-areas.mts'
import { ghSubcommandWords } from './github-invocation.mts'
import {
  isBareVariableWord,
  resolveLiteralAssignments,
  variableName,
} from './shell-variable-assignments.mts'

const GITHUB_POLICIES =
  'the GitHub policies (draft-first PRs, merge authority, the gh stack allowlist)'

/**
 * `$GH pr merge 1` chooses the executable at run time. A literal same-command assignment
 * (`GH=gh; $GH pr merge 1`) is resolved and re-checked as its own candidate command
 * (github-wrapper-payloads.mts); this only fails closed when it is NOT resolvable and the area
 * word past it — skipping a `-R`/`--repo` the way a real gh invocation would (`$GH -R o/r pr
 * merge 1`), via the same scan `parseGhInvocation` uses — is one a policy actually gates
 * (`POLICY_GATED_GH_AREAS`), so ordinary variable executables (`$EDITOR file`, `"$cmd" args`,
 * `$DOCKER run`, `"$PYTHON" --version`) stay unblocked even though `run`/`--version` are
 * themselves valid gh areas, just not policy-gated ones.
 */
export function findUnresolvedVariableExecutableBlock(
  tokens: string[],
  index: number,
): BlockDecision | null {
  if (!isBareVariableWord(tokens[index])) return null
  const name = variableName(tokens[index])
  if (resolveLiteralAssignments(tokens, index)[name] !== undefined) return null
  const [area] = ghSubcommandWords(tokens, index)
  if (area === undefined || !POLICY_GATED_GH_AREAS.has(area)) return null
  return {
    reason: `\`${tokens[index]}\` is a variable executable the hook cannot resolve to a literal command, so it cannot check what it runs against ${GITHUB_POLICIES}. Assign it a literal command first, or run gh directly.`,
  }
}
