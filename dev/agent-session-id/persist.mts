import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { isGrokHookProcess } from '../codex-hooks/hook-payload.mts'
import type { HookPayload } from '../codex-hooks/types.mts'
import { isValidSessionId } from './valid-id.mts'

export type SessionPersistAgent = 'codex' | 'cursor' | 'grok'

export const SESSION_PERSIST_RELATIVE = {
  codex: '.local/codex-session-id',
  cursor: '.local/cursor-session-id',
  grok: '.local/grok-session-id',
} as const

export function enclosingWorktreeRoot(cwd: string): string {
  let candidate = resolve(cwd)
  while (!existsSync(join(candidate, '.git'))) {
    const parent = dirname(candidate)
    if (parent === candidate) return resolve(cwd)
    candidate = parent
  }
  return candidate
}

export function sessionPersistPath(cwd: string, agent: SessionPersistAgent): string {
  return join(cwd, SESSION_PERSIST_RELATIVE[agent])
}

function sanitizeToken(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return isValidSessionId(trimmed) ? trimmed : ''
}

export function hookPayloadSessionId(
  payload: HookPayload,
  keys: readonly string[] = ['session_id', 'sessionId'],
): string {
  for (const key of keys) {
    const id = sanitizeToken(payload[key])
    if (id !== '') return id
  }
  return ''
}

export function cursorPayloadSessionId(payload: HookPayload): string {
  return hookPayloadSessionId(payload, ['session_id', 'sessionId', 'conversation_id'])
}

export function grokHookSessionId(payload: HookPayload, env: NodeJS.ProcessEnv): string {
  return sanitizeToken(env.GROK_SESSION_ID) || hookPayloadSessionId(payload)
}

export function readPersistedSessionId(
  cwd: string,
  agent: SessionPersistAgent,
  options: { strict?: boolean } = {},
): string | undefined {
  try {
    const raw = readFileSync(sessionPersistPath(cwd, agent), 'utf8').trim()
    if (isValidSessionId(raw)) return raw
    if (options.strict) throw new Error(`invalid persisted ${agent} session id format`)
    return undefined
  } catch (error) {
    if (options.strict && (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return undefined
  }
}

function writePersistFile(cwd: string, agent: SessionPersistAgent, sessionId: string): void {
  mkdirSync(join(cwd, '.local'), { recursive: true })
  writeFileSync(sessionPersistPath(cwd, agent), `${sessionId}\n`, { encoding: 'utf8' })
}

function tryWritePersistFile(cwd: string, agent: SessionPersistAgent, sessionId: string): void {
  try {
    writePersistFile(cwd, agent, sessionId)
  } catch {
    // Hooks must not fail closed when the persist file cannot be written.
  }
}

export function persistRealSessionId(
  cwd: string,
  agent: SessionPersistAgent,
  sessionId: string,
): void {
  const id = sanitizeToken(sessionId)
  if (id === '') return
  tryWritePersistFile(cwd, agent, id)
}

export function resolveAndPersistSessionStartId(options: {
  cwd: string
  agent: SessionPersistAgent
  payloadId: string
  generateId?: () => string
}): { generated: boolean; sessionId: string } {
  const real = sanitizeToken(options.payloadId)
  if (real !== '') {
    tryWritePersistFile(options.cwd, options.agent, real)
    return { generated: false, sessionId: real }
  }
  const existing = readPersistedSessionId(options.cwd, options.agent)
  if (existing !== undefined) return { generated: false, sessionId: existing }
  const prefix = `${options.agent}-`
  const generated = sanitizeToken(options.generateId?.() ?? `${prefix}${randomUUID()}`)
  const sessionId = generated === '' ? `${prefix}${randomUUID()}` : generated
  tryWritePersistFile(options.cwd, options.agent, sessionId)
  return { generated: true, sessionId }
}

// Unlike the hook-oriented Cursor/Grok path above, an interactive root Codex caller cannot
// continue without a durable session identity. Write and read-back failures intentionally surface.
export function resolveAndPersistRootCodexSessionId(options: {
  cwd: string
  payloadId?: string
  newSession?: boolean
  generateId?: () => string
}): { generated: boolean; sessionId: string } {
  const real = options.payloadId?.trim() ?? ''
  if (real !== '' && !isValidSessionId(real)) {
    throw new Error('invalid root Codex session id format')
  }
  try {
    const existing =
      real === '' && !options.newSession
        ? readPersistedSessionId(options.cwd, 'codex', { strict: true })
        : undefined
    let sessionId = real || existing
    if (!sessionId) {
      const generated = sanitizeToken(options.generateId?.() ?? `codex-${randomUUID()}`)
      sessionId = generated === '' ? `codex-${randomUUID()}` : generated
    }
    writePersistFile(options.cwd, 'codex', sessionId)
    if (readPersistedSessionId(options.cwd, 'codex', { strict: true }) !== sessionId) {
      throw new Error('persisted session id did not match the selected id')
    }
    return { generated: real === '' && existing === undefined, sessionId }
  } catch (error) {
    throw new Error('failed to persist root Codex session id', { cause: error })
  }
}

export function persistGrokSessionStart(
  payload: HookPayload,
  env: NodeJS.ProcessEnv,
  cwd: string,
  generateId?: () => string,
): { generated: boolean; sessionId: string } | undefined {
  if (!isGrokHookProcess(env)) return undefined
  return resolveAndPersistSessionStartId({
    agent: 'grok',
    cwd,
    generateId,
    payloadId: grokHookSessionId(payload, env),
  })
}

export function persistGrokRealSessionId(
  payload: HookPayload,
  env: NodeJS.ProcessEnv,
  cwd: string,
): void {
  if (!isGrokHookProcess(env)) return
  persistRealSessionId(cwd, 'grok', grokHookSessionId(payload, env))
}
