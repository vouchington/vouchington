import type { BlockDecision } from './core.mts'
import {
  isBareVariableWord,
  resolveLiteralAssignments,
  variableName,
} from './shell-variable-assignments.mts'
import { nextShellCommandSeparatorIndex } from './shell-token-utils.mts'

const GITHUB_POLICIES =
  'the GitHub policies (draft-first PRs, merge authority, the gh stack allowlist)'

/**
 * `eval "$CMD"` runs whatever `$CMD` expands to. A literal same-command assignment is resolved
 * and re-checked as its own candidate command (github-wrapper-payloads.mts); this only fails
 * closed when eval's whole argument is an unresolved bare parameter expansion. A command
 * substitution (`eval "$(mise activate zsh)"`) is not a bare variable, so it stays unblocked here.
 */
export function findUnresolvedEvalBlock(tokens: string[], index: number): BlockDecision | null {
  if (basename(tokens[index]) !== 'eval') return null
  const end = nextShellCommandSeparatorIndex(tokens, index + 1)
  const args =
    tokens[index + 1] === '--' ? tokens.slice(index + 2, end) : tokens.slice(index + 1, end)
  if (args.length !== 1 || !isBareVariableWord(args[0])) return null
  if (resolveLiteralAssignments(tokens, index)[variableName(args[0])] !== undefined) return null
  return {
    reason: `\`eval\`'s argument is a variable the hook cannot resolve to a literal command, so it cannot check what it runs against ${GITHUB_POLICIES}. Assign it a literal gh command first, or run gh directly.`,
  }
}

function basename(word: string): string {
  return word.slice(word.lastIndexOf('/') + 1)
}
