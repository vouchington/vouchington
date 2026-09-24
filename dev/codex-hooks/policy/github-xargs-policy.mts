import type { BlockDecision } from './core.mts'
import { commandPrefixAt } from './github-command-position.mts'
import { ghSubcommandWords } from './github-invocation.mts'
import type { CommandPrefix } from './shell-command-wrappers.mts'
import { shellScriptOperandIndex } from './shell-script-operand.mts'
import { tokenizeShellWords } from './shell-tokenizer.mts'

const XARGS_GH_SUBCOMMAND_BLOCK: BlockDecision = {
  reason:
    '`xargs` supplies this gh subcommand from its input, so the hook cannot check it against the GitHub policies (draft-first PRs, merge authority, the gh stack allowlist). Run gh with a literal subcommand instead.',
}

/**
 * `xargs gh …` appends stdin items to gh's arguments and fills its replacement string (`-I {}`)
 * from stdin, so a gh subcommand that is missing or contains the replacement string is chosen at
 * run time, as is one inside a `sh -c` script that xargs fills in. The GitHub policies key on
 * that subcommand, so fail closed instead of guessing.
 */
export function findXargsGhSubcommandBlock(
  prefix: CommandPrefix,
  tokens: string[],
  index: number,
): BlockDecision | null {
  if (!prefix.wrappers.includes('xargs')) return null
  const filledIn = (word: string): boolean =>
    prefix.xargsReplacements.some(replacement => word.includes(replacement))
  if (isGh(tokens[index])) {
    const subcommand = ghSubcommandWords(tokens, index)
    return subcommand.length < 2 || subcommand.some(filledIn) ? XARGS_GH_SUBCOMMAND_BLOCK : null
  }

  const scriptIndex = shellScriptOperandIndex(tokens, index)
  if (scriptIndex === undefined) return null
  const words = tokenizeShellWords(tokens[scriptIndex], { splitRedirections: true })
  const scriptFillsSubcommand = words.some(
    (word, wordIndex) =>
      isGh(word) &&
      commandPrefixAt(words, wordIndex) !== null &&
      ghSubcommandWords(words, wordIndex).some(filledIn),
  )
  return scriptFillsSubcommand ? XARGS_GH_SUBCOMMAND_BLOCK : null
}

function isGh(word: string): boolean {
  const name = word.slice(word.lastIndexOf('/') + 1)
  return name === 'gh' || name === 'gh-stack'
}
