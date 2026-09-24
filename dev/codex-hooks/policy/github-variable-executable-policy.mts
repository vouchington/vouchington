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

// A parameter expansion (`$NAME`, `${NAME}`, `${NAME:-gh}`) — a `$` not immediately followed by
// `(`, so a command substitution (`$(which gh)`) is excluded: that shape is resolved separately by
// the `GH_LOOKUP_SUBSTITUTION` payload in github-wrapper-payloads.mts before this check ever runs,
// and re-flagging it here would fail closed on an already-resolved invocation. Backticks are
// excluded outright, since they are always command substitution, never parameter expansion.
const PARAMETER_EXPANSION = /\$(?!\()/

/**
 * `$GH pr merge 1` chooses the executable at run time, and so does any other word in the command
 * position built from a parameter expansion (`${GH:-gh} pr merge 1`, `"${GH}" pr merge 1`). A
 * literal same-command assignment (`GH=gh; $GH pr merge 1`) is resolved and re-checked as its own
 * candidate command (github-wrapper-payloads.mts) — that resolution only covers the exact bare
 * form (`$NAME`/`${NAME}`), so a default-value or otherwise non-bare expansion always fails closed
 * — and this only fails closed when the word is NOT resolvable and the area word past it —
 * skipping a `-R`/`--repo` the way a real gh invocation would (`$GH -R o/r pr merge 1`), via the
 * same scan `parseGhInvocation` uses — is one a policy actually gates (`POLICY_GATED_GH_AREAS`),
 * so ordinary variable executables (`$EDITOR file`, `"$cmd" args`, `$DOCKER run`, `"$PYTHON"
 * --version`) stay unblocked even though `run`/`--version` are themselves valid gh areas, just not
 * policy-gated ones.
 */
export function findUnresolvedVariableExecutableBlock(
  tokens: string[],
  index: number,
): BlockDecision | null {
  const word = tokens[index]
  if (word === undefined || !PARAMETER_EXPANSION.test(word)) return null
  if (isBareVariableWord(word)) {
    const name = variableName(word)
    if (resolveLiteralAssignments(tokens, index)[name] !== undefined) return null
  }
  const [area] = ghSubcommandWords(tokens, index)
  if (area === undefined || !POLICY_GATED_GH_AREAS.has(area)) return null
  return {
    reason: `\`${word}\` is a variable executable the hook cannot resolve to a literal command, so it cannot check what it runs against ${GITHUB_POLICIES}. Assign it a literal command first, or run gh directly.`,
  }
}
