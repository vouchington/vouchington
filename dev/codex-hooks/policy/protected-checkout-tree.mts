import type { SegmentAction } from './protected-checkout-checkout.mts'
import { checkoutPathspecIsBroad, isProtectedCheckoutPath } from './protected-checkout-paths.mts'

const REBASE_CONTROL = new Set(['--continue', '--abort', '--skip', '--quit'])
const WORKTREE_RESET = new Set(['--hard', '--merge', '--keep'])

export function classifyRebase(tokens: string[]): SegmentAction[] {
  if (tokens.some(token => REBASE_CONTROL.has(token))) return []
  const positionals = rebasePositionals(tokens)
  if (positionals.length >= 2) return [{ kind: 'tree', target: undefined }]
  const ontoIndex = tokens.indexOf('--onto')
  if (ontoIndex >= 0) return [{ kind: 'tree', target: tokens[ontoIndex + 1] }]
  return [{ kind: 'tree', target: positionals[0] }]
}

export function classifyReset(tokens: string[]): SegmentAction[] {
  if (!tokens.some(token => WORKTREE_RESET.has(token))) return []
  return [{ kind: 'tree', target: firstPositional(tokens, 2) ?? 'HEAD' }]
}

export function classifyPositional(tokens: string[]): SegmentAction[] {
  if (tokens.includes('--abort') || tokens.includes('--quit')) return []
  const remote = firstPositional(tokens, 2)
  const branch =
    remote === undefined ? undefined : firstPositional(tokens, tokens.indexOf(remote) + 1)
  if (tokens[1] === 'pull' && remote !== undefined && branch !== undefined) {
    return [{ kind: 'tree', target: `${remote}/${branch}` }]
  }
  return [{ kind: 'tree', target: remote }]
}

export function classifyRestore(tokens: string[]): SegmentAction[] {
  const paths = tokens.slice(2).filter(token => token !== '--' && !token.startsWith('-'))
  if (
    paths.length === 0 ||
    paths.some(path => checkoutPathspecIsBroad(path) || isProtectedCheckoutPath(path))
  ) {
    return [{ kind: 'tree', target: undefined }]
  }
  return []
}

export function classifyCherryPick(tokens: string[]): SegmentAction[] {
  if (tokens.some(token => REBASE_CONTROL.has(token))) return []
  return [{ kind: 'tree', target: undefined }]
}

export function classifyStash(tokens: string[]): SegmentAction[] {
  if (tokens[2] !== 'pop' && tokens[2] !== 'apply' && tokens[2] !== 'branch') return []
  return [{ kind: 'tree', target: undefined }]
}

function rebasePositionals(tokens: string[]): string[] {
  const positionals: string[] = []
  for (let index = 2; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === undefined || token === '--') break
    if (!token.startsWith('-')) positionals.push(token)
  }
  return positionals
}

function firstPositional(tokens: string[], from: number): string | undefined {
  for (let index = from; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === undefined || token === '--') return tokens[index + 1]
    if (!token.startsWith('-')) return token
  }
  return undefined
}
