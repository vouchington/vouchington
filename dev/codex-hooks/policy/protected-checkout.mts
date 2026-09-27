import type { BlockDecision } from './core.mts'
import { classifySegment } from './protected-checkout-classify.mts'
import {
  isProtectedCheckoutPath,
  protectedCheckoutReason,
  staleFetchCheckoutReason,
} from './protected-checkout-paths.mts'
import { commandsToInspectPreservingQuotes } from './shell-commands.mts'

export type ProtectedCheckoutDiff = (cwd: string, target: string) => readonly string[] | undefined

export function findProtectedCheckoutBlock(
  command: string,
  cwd: string,
  readDiff: ProtectedCheckoutDiff | undefined,
): BlockDecision | null {
  for (const inspected of commandsToInspectPreservingQuotes(command)) {
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
  const segments: string[] = []
  let current = ''
  let quote: "'" | '"' | null = null
  let escaping = false
  const push = (): void => {
    const trimmed = current.trim()
    if (trimmed !== '') segments.push(trimmed)
    current = ''
  }
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index] ?? ''
    if (escaping) {
      current += char
      escaping = false
      continue
    }
    if (char === '\\' && quote !== "'") {
      escaping = true
      current += char
      continue
    }
    if (quote !== null) {
      if (char === quote) quote = null
      current += char
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      current += char
      continue
    }
    if (char === '&' && command[index + 1] === '&') {
      push()
      index += 1
      continue
    }
    if (char === '\n' || char === ';' || char === '|') {
      push()
      continue
    }
    current += char
  }
  push()
  return segments
}
