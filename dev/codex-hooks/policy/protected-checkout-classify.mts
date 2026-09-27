import { classifyCheckout, type SegmentAction } from './protected-checkout-checkout.mts'
import { tokenizeShellWords } from './shell-tokenizer.mts'

const REBASE_CONTROL = new Set(['--continue', '--abort', '--skip', '--quit'])

export type { SegmentAction }

export function classifySegment(segment: string): SegmentAction[] {
  const tokens = commandTokens(segment)
  if (isStackRewrite(tokens)) return [{ kind: 'tree', target: 'origin/main' }]
  if (tokens[0] !== 'git') return []
  return classifyGit(tokens)
}

function isStackRewrite(tokens: string[]): boolean {
  return (
    tokens[0] === 'gh' && tokens[1] === 'stack' && (tokens[2] === 'rebase' || tokens[2] === 'sync')
  )
}

function classifyGit(tokens: string[]): SegmentAction[] {
  const subcommand = tokens[1]
  if (subcommand === 'fetch') return [{ kind: 'fetch' }]
  if (subcommand === 'rebase') return classifyRebase(tokens)
  if (subcommand === 'reset') return classifyReset(tokens)
  if (subcommand === 'merge' || subcommand === 'pull') return classifyPositional(tokens)
  if (subcommand === 'checkout' || subcommand === 'switch') return classifyCheckout(tokens)
  return []
}

function classifyRebase(tokens: string[]): SegmentAction[] {
  if (tokens.some(token => REBASE_CONTROL.has(token))) return []
  const ontoIndex = tokens.indexOf('--onto')
  if (ontoIndex >= 0) return [{ kind: 'tree', target: tokens[ontoIndex + 1] }]
  return [{ kind: 'tree', target: firstPositional(tokens, 2) }]
}

function classifyReset(tokens: string[]): SegmentAction[] {
  const hardIndex = tokens.indexOf('--hard')
  if (hardIndex < 0) return []
  return [{ kind: 'tree', target: tokens[hardIndex + 1] ?? 'HEAD' }]
}

function classifyPositional(tokens: string[]): SegmentAction[] {
  if (tokens.includes('--abort') || tokens.includes('--quit')) return []
  const remote = firstPositional(tokens, 2)
  const branch =
    remote === undefined ? undefined : firstPositional(tokens, tokens.indexOf(remote) + 1)
  if (tokens[1] === 'pull' && remote !== undefined && branch !== undefined) {
    return [{ kind: 'tree', target: `${remote}/${branch}` }]
  }
  return [{ kind: 'tree', target: remote }]
}

function firstPositional(tokens: string[], from: number): string | undefined {
  for (let index = from; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === undefined || token === '--') return tokens[index + 1]
    if (!token.startsWith('-')) return token
  }
  return undefined
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
