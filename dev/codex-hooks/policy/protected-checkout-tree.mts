import type { SegmentAction } from './protected-checkout-checkout.mts'
import { isProtectedCheckoutPath } from './protected-checkout-paths.mts'

const REBASE_CONTROL = new Set(['--continue', '--abort', '--skip', '--quit'])

export function classifyRebase(tokens: string[]): SegmentAction[] {
  if (tokens.some(token => REBASE_CONTROL.has(token))) return []
  const ontoIndex = tokens.indexOf('--onto')
  if (ontoIndex >= 0) return [{ kind: 'tree', target: tokens[ontoIndex + 1] }]
  return [{ kind: 'tree', target: firstPositional(tokens, 2) }]
}

export function classifyReset(tokens: string[]): SegmentAction[] {
  if (!tokens.includes('--hard')) return []
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
  if (paths.length === 0 || paths.includes('.') || paths.some(isProtectedCheckoutPath)) {
    return [{ kind: 'tree', target: undefined }]
  }
  return []
}

export function classifyCherryPick(tokens: string[]): SegmentAction[] {
  if (tokens.some(token => REBASE_CONTROL.has(token))) return []
  return [{ kind: 'tree', target: undefined }]
}

export function classifyStash(tokens: string[]): SegmentAction[] {
  if (tokens[2] !== 'pop' && tokens[2] !== 'apply') return []
  return [{ kind: 'tree', target: undefined }]
}

function firstPositional(tokens: string[], from: number): string | undefined {
  for (let index = from; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === undefined || token === '--') return tokens[index + 1]
    if (!token.startsWith('-')) return token
  }
  return undefined
}
