import type { HookPayload } from '../types.mts'
import { isRecord } from './core.mts'
import { tokenizeShellWords } from './shell-tokenizer.mts'

const KEY_PATH_LIKE_RE = /(?:^|_)(?:cwd|file|filename|path|workdir|workspace)(?:_|$)/i
export function keyLooksPathLike(key: string): boolean {
  const snake = key.replaceAll(/[A-Z]/g, match => `_${match.toLowerCase()}`)
  return KEY_PATH_LIKE_RE.test(snake)
}

export function hookPayloadReferencesClairePath(payload: HookPayload, command: string): boolean {
  return hookValueReferencesClairePath(payload) || commandReferencesClairePath(command)
}

export function commandReferencesClairePath(command: string): boolean {
  if (command.startsWith('*** Begin Patch')) {
    return patchReferencesClairePath(command)
  }

  return tokenizeShellWords(command).some(token => tokenReferencesClairePath(token))
}

export function hookValueReferencesClairePath(value: unknown, key?: string): boolean {
  if (typeof value === 'string') {
    if (value.startsWith('*** Begin Patch')) {
      return patchReferencesClairePath(value)
    }

    return key !== undefined && keyLooksPathLike(key) && value.includes('.claire')
  }

  if (Array.isArray(value)) {
    return value.some(nestedValue => hookValueReferencesClairePath(nestedValue, key))
  }

  if (!isRecord(value)) {
    return false
  }

  for (const [nestedKey, nestedValue] of Object.entries(value)) {
    if (nestedKey === 'command') {
      continue
    }

    if (hookValueReferencesClairePath(nestedValue, nestedKey)) {
      return true
    }
  }

  return false
}

export function patchReferencesClairePath(command: string): boolean {
  return command
    .split('\n')
    .some(line =>
      tokenReferencesClairePath(
        line.replace(/^(?:\*\*\* (?:Add|Delete|Update) File:|\*\*\* Move to:)\s+/, ''),
      ),
    )
}

export function tokenReferencesClairePath(token: string): boolean {
  return (
    token === '.claire' ||
    token.startsWith('.claire/') ||
    token.endsWith('/.claire') ||
    token.includes('/.claire/')
  )
}
