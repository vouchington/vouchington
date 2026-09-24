import type { BlockDecision } from './core.mts'
import { type GhInvocation, ghSubcommandWords } from './github-invocation.mts'
import { findXargsGhSubcommandBlock } from './github-xargs-policy.mts'
import type { CommandPrefix } from './shell-command-wrappers.mts'

const GITHUB_POLICIES =
  'the GitHub policies (draft-first PRs, merge authority, the gh stack allowlist)'
// Areas whose policies key on the action too (`pr merge`, `pr create`, `issue create`).
const ACTION_POLICY_AREAS = new Set(['issue', 'pr'])

/**
 * A gh command whose subcommand or alias expansion the hook cannot read. The GitHub policies key
 * on those words, so the hook fails closed with a reason that names what hid them.
 */
export function findOpaqueGhBlock(
  prefix: CommandPrefix,
  tokens: string[],
  index: number,
  invocation: GhInvocation | null,
): BlockDecision | null {
  return (
    findXargsGhSubcommandBlock(prefix, tokens, index) ??
    findExpandedGhSubcommandBlock(tokens, index) ??
    findUnreadableGhAliasBlock(invocation)
  )
}

// `gh "$@"` in a shell function, `gh $CMD`, and `gh pr "$ACTION"` choose the subcommand at run
// time. No gh area or action contains `$` or a backtick, so either one marks an expansion.
// gh stack actions need no rule here: the stack allowlist is closed.
function findExpandedGhSubcommandBlock(tokens: string[], index: number): BlockDecision | null {
  if (tokens[index].slice(tokens[index].lastIndexOf('/') + 1) !== 'gh') return null
  const [area, action] = ghSubcommandWords(tokens, index)
  const actionIsGated = area !== undefined && ACTION_POLICY_AREAS.has(area)
  if (!isExpansion(area) && !(actionIsGated && isExpansion(action))) return null
  return {
    reason: `This gh subcommand comes from a shell expansion (\`$VAR\`, \`"$@"\`, \`$(…)\`), for example a shell function that forwards its arguments to gh, so the hook cannot check it against ${GITHUB_POLICIES}. Run gh with a literal subcommand instead.`,
  }
}

function isExpansion(word: string | undefined): boolean {
  return word !== undefined && /[$`]/.test(word)
}

// `gh alias import [FILE | -]` and `gh alias set NAME -` read expansions the hook never sees, and
// a later `gh NAME` cannot be tied back to them. Literal `gh alias set` expansions are inspected
// as payloads instead (github-wrapper-payloads.mts).
function findUnreadableGhAliasBlock(invocation: GhInvocation | null): BlockDecision | null {
  if (invocation?.area !== 'alias') return null
  const operands = invocation.optionTokens.filter(token => token === '-' || !token.startsWith('-'))
  if (invocation.action !== 'import' && !(invocation.action === 'set' && operands[1] === '-')) {
    return null
  }
  return {
    reason: `\`gh alias import\` and \`gh alias set NAME -\` read alias expansions the hook cannot see, so it cannot check them against ${GITHUB_POLICIES}. Define each alias with a literal expansion: \`gh alias set NAME 'EXPANSION'\`.`,
  }
}
