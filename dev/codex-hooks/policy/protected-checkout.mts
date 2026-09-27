import type { BlockDecision } from './core.mts'
import {
  isProtectedCheckoutPath,
  protectedCheckoutReason,
  staleFetchCheckoutReason,
} from './protected-checkout-paths.mts'
import { commandsToInspectForGitPolicy } from './shell-commands.mts'
import { tokenizeShellWords } from './shell-tokenizer.mts'

const REBASE_CONTROL = new Set(['--continue', '--abort', '--skip', '--quit'])

export type ProtectedCheckoutDiff = (cwd: string, target: string) => readonly string[] | undefined

type SegmentAction = { kind: 'fetch' } | { kind: 'tree'; target: string | undefined }

export function findProtectedCheckoutBlock(
  command: string,
  cwd: string,
  readDiff: ProtectedCheckoutDiff | undefined,
): BlockDecision | null {
  for (const inspected of commandsToInspectForGitPolicy(command)) {
    const block = blockForInspectedCommand(inspected, cwd, readDiff)
    if (block !== null) return block
  }
  return null
}

function blockForInspectedCommand(
  inspected: string,
  cwd: string,
  readDiff: ProtectedCheckoutDiff | undefined,
): BlockDecision | null {
  const actions = shellSegments(inspected).flatMap(classifySegment)
  if (
    actions.some(action => action.kind === 'fetch') &&
    actions.some(action => action.kind === 'tree')
  ) {
    return { reason: staleFetchCheckoutReason() }
  }

  for (const action of actions) {
    if (action.kind !== 'tree') continue
    const block = blockTreeUpdate(action.target, cwd, readDiff)
    if (block !== null) return block
  }
  return null
}

function blockTreeUpdate(
  target: string | undefined,
  cwd: string,
  readDiff: ProtectedCheckoutDiff | undefined,
): BlockDecision | null {
  if (target === undefined || target.startsWith('-')) {
    return { reason: protectedCheckoutReason([]) }
  }
  if (readDiff === undefined) return null

  const names = readDiff(cwd, target)
  if (names === undefined) return { reason: protectedCheckoutReason([]) }
  const protectedNames = names.filter(isProtectedCheckoutPath)
  if (protectedNames.length === 0) return null
  return { reason: protectedCheckoutReason(protectedNames) }
}

function shellSegments(command: string): string[] {
  return command
    .split(/&&|\|\||[;|\n]/)
    .map(segment => segment.trim())
    .filter(segment => segment !== '')
}

function classifySegment(segment: string): SegmentAction[] {
  const tokens = commandTokens(segment)
  if (
    tokens[0] === 'gh' &&
    tokens[1] === 'stack' &&
    (tokens[2] === 'rebase' || tokens[2] === 'sync')
  ) {
    return [{ kind: 'tree', target: 'origin/main' }]
  }
  if (tokens[0] !== 'git') return []

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

function classifyCheckout(tokens: string[]): SegmentAction[] {
  const creatingFlags = new Set(['-b', '-c', '--orphan'])
  const startFlags = new Set(['-b', '-B', '-c', '-C', '--orphan'])
  let creating = false
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
    if (startFlags.has(token)) {
      creating = creatingFlags.has(token)
      index += 1
      if (index + 1 < tokens.length && !(tokens[index + 1] ?? '').startsWith('-')) {
        index += 1
        start = tokens[index]
      }
      continue
    }
    if (token.startsWith('-')) continue
    if (branch === undefined) {
      branch = token
      continue
    }
    paths.push(token)
  }

  if (paths.length > 0) {
    return paths.some(isProtectedCheckoutPath)
      ? [{ kind: 'tree', target: start ?? branch ?? 'HEAD' }]
      : []
  }
  if (creating && start === undefined) return []
  const target = start ?? branch
  return target === undefined ? [] : [{ kind: 'tree', target }]
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
