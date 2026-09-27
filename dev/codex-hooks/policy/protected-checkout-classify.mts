import { classifyCheckout, type SegmentAction } from './protected-checkout-checkout.mts'
import {
  classifyCherryPick,
  classifyPositional,
  classifyRebase,
  classifyReset,
  classifyRestore,
  classifyStash,
} from './protected-checkout-tree.mts'
import { tokenizeShellWords } from './shell-tokenizer.mts'

export type { SegmentAction }

export function classifySegment(segment: string): SegmentAction[] {
  const tokens = commandTokens(segment)
  // gh stack rebase/sync stay on the stack allowlist. Their parent is not origin/main, and the
  // hook cannot resolve it without a network call.
  if (tokens[0] !== 'git') return []
  return classifyGit(tokens)
}

function classifyGit(tokens: string[]): SegmentAction[] {
  const subcommand = tokens[1]
  if (subcommand === 'fetch') return [{ kind: 'fetch' }]
  if (subcommand === 'pull') return [{ kind: 'fetch' }, ...classifyPositional(tokens)]
  if (subcommand === 'rebase') return classifyRebase(tokens)
  if (subcommand === 'reset') return classifyReset(tokens)
  if (subcommand === 'merge') return classifyPositional(tokens)
  if (subcommand === 'checkout' || subcommand === 'switch') return classifyCheckout(tokens)
  if (subcommand === 'cherry-pick') return classifyCherryPick(tokens)
  if (subcommand === 'restore') return classifyRestore(tokens)
  if (subcommand === 'stash') return classifyStash(tokens)
  return []
}

function commandTokens(segment: string): string[] {
  const tokens = tokenizeShellWords(segment)
  let index = 0
  while (index < tokens.length) {
    const token = tokens[index] ?? ''
    if (token === 'env' || /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
      index += 1
      continue
    }
    break
  }
  return tokens.slice(index)
}
