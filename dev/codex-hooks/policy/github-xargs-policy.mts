import type { BlockDecision } from './core.mts'
import { commandPrefixAt } from './github-command-position.mts'
import { ghSubcommandWords } from './github-invocation.mts'
import type { CommandPrefix } from './shell-command-wrappers.mts'
import { isGhWord } from './shell-gh-word.mts'
import { shellScriptOperandIndex } from './shell-script-operand.mts'
import { tokenizeShellWords } from './shell-tokenizer.mts'

const XARGS_GH_SUBCOMMAND_BLOCK: BlockDecision = {
  reason:
    '`xargs` supplies this gh subcommand from its input, so the hook cannot check it against the GitHub policies (draft-first PRs, merge authority, the gh stack allowlist). Run gh with a literal subcommand instead.',
}
// Areas whose policies key on the action as well (`pr merge`, `issue create`, the gh stack
// allowlist). The stack allowlist reads only a present action, so xargs must not supply it.
const ACTION_POLICY_AREAS = new Set(['issue', 'pr', 'stack'])

/**
 * `xargs gh …` appends stdin items to gh's arguments and fills its replacement string (`-I {}`)
 * from stdin, so a gh area or gated action that is missing or contains the replacement string is
 * chosen at run time, as is one inside a `sh -c` script that xargs fills in. The GitHub policies
 * key on those words, so fail closed instead of guessing. Other words, such as a `gh api`
 * endpoint, are arguments the policies read as best-effort only.
 */
export function findXargsGhSubcommandBlock(
  prefix: CommandPrefix,
  tokens: string[],
  index: number,
): BlockDecision | null {
  if (!prefix.wrappers.includes('xargs')) return null
  const filledIn = (word: string): boolean =>
    prefix.xargsReplacements.some(replacement => word.includes(replacement))
  if (isGhWord(tokens[index])) {
    const [area, action] = ghSubcommandWords(tokens, index)
    const missing = area === undefined || (ACTION_POLICY_AREAS.has(area) && action === undefined)
    return missing || fillsGatedWord([area, action], filledIn) ? XARGS_GH_SUBCOMMAND_BLOCK : null
  }

  const scriptIndex = shellScriptOperandIndex(tokens, index)
  if (scriptIndex === undefined) return null
  const words = tokenizeShellWords(tokens[scriptIndex], { splitRedirections: true })
  const scriptFillsSubcommand = words.some(
    (word, wordIndex) =>
      isGhWord(word) &&
      commandPrefixAt(words, wordIndex) !== null &&
      fillsGatedWord(ghSubcommandWords(words, wordIndex), filledIn),
  )
  return scriptFillsSubcommand ? XARGS_GH_SUBCOMMAND_BLOCK : null
}

function fillsGatedWord(
  [area, action]: (string | undefined)[],
  filledIn: (word: string) => boolean,
): boolean {
  if (area === undefined) return false
  return (
    filledIn(area) || (ACTION_POLICY_AREAS.has(area) && action !== undefined && filledIn(action))
  )
}
