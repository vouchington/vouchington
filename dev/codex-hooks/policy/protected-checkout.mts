import type { BlockDecision } from './core.mts'
import { classifySegment } from './protected-checkout-classify.mts'
import {
  isProtectedCheckoutPath,
  protectedCheckoutReason,
  staleFetchCheckoutReason,
} from './protected-checkout-paths.mts'
import { commandsToInspectForGitPolicy } from './shell-commands.mts'

export type ProtectedCheckoutDiff = (cwd: string, target: string) => readonly string[] | undefined

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
