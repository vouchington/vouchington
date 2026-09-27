import { checkoutPathspecIsBroad, isProtectedCheckoutPath } from './protected-checkout-paths.mts'

export type SegmentAction = { kind: 'fetch' } | { kind: 'tree'; target: string | undefined }

export function classifyCheckout(tokens: string[]): SegmentAction[] {
  const parsed = parseCheckout(tokens)
  if (parsed.paths.some(checkoutPathspecIsBroad)) return [{ kind: 'tree', target: undefined }]
  if (parsed.paths.length > 0) {
    return parsed.paths.some(isProtectedCheckoutPath)
      ? [{ kind: 'tree', target: parsed.start ?? parsed.branch ?? 'HEAD' }]
      : []
  }
  if (parsed.creating && parsed.start === undefined && !parsed.forced) return []
  const target = parsed.start ?? parsed.branch ?? (parsed.forced ? 'HEAD' : undefined)
  return target === undefined ? [] : [{ kind: 'tree', target }]
}

function parseCheckout(tokens: string[]): {
  branch: string | undefined
  creating: boolean
  forced: boolean
  paths: string[]
  start: string | undefined
} {
  const creatingFlags = new Set(['-b', '-c', '--orphan'])
  const startFlags = new Set(['-b', '-B', '-c', '-C', '--orphan'])
  let creating = false
  let forced = false
  let start: string | undefined
  let branch: string | undefined
  const paths: string[] = []
  let afterDoubleDash = false

  for (let index = 2; index < tokens.length; index += 1) {
    const token = tokens[index] ?? ''
    if (token === '--') {
      afterDoubleDash = true
      continue
    }
    if (afterDoubleDash) {
      paths.push(token)
      continue
    }
    if (token === '-f' || token === '--force') {
      forced = true
      continue
    }
    if (startFlags.has(token)) {
      creating = creatingFlags.has(token)
      const consumed = consumeBranchStart(tokens, index)
      index = consumed.index
      start = consumed.start
      continue
    }
    if (token.startsWith('-')) continue
    if (branch === undefined) {
      branch = token
      continue
    }
    paths.push(token)
  }

  return { branch, creating, forced, paths, start }
}

function consumeBranchStart(
  tokens: string[],
  flagIndex: number,
): { index: number; start: string | undefined } {
  const nameIndex = flagIndex + 1
  const branchName = tokens[nameIndex] ?? ''
  if (branchName === '' || branchName === '--' || branchName.startsWith('-')) {
    return { index: flagIndex, start: undefined }
  }
  let index = nameIndex + 1
  while (index < tokens.length) {
    const token = tokens[index] ?? ''
    if (token === '--' || !token.startsWith('-')) break
    index += 1
  }
  const start = tokens[index] ?? ''
  if (start === '' || start === '--' || start.startsWith('-')) {
    return { index: nameIndex, start: undefined }
  }
  return { index, start }
}
