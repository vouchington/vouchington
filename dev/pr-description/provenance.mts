/**
 * Resolves tool-derived PR-body provenance lines: which agent (or human) authored the change,
 * from which device, and in which worktree. Every dependency is injectable so tests never touch
 * real env vars, git, or `os` — see `ProvenanceDeps`.
 */

import { execFile } from 'node:child_process'
import { hostname as osHostname, userInfo } from 'node:os'
import { basename } from 'node:path'
import { promisify } from 'node:util'

import { inspectHarnessEnvironment } from 'vouchington-tooling/agent-harness-identity'

import { isValidSessionId } from '../agent-session-id/valid-id.mts'
import type { BodySource } from './body-source.mts'
import { type Harness, resolveModelFromTranscript } from './provenance-model.mts'
import { injectProvenance } from './provenance-inject.mts'

const execFileAsync = promisify(execFile)

export type Provenance = { agent: string; device: string; worktree: string }

export type ProvenanceDeps = {
  env?: NodeJS.ProcessEnv
  gitToplevel?: () => Promise<string>
  hostname?: () => string
  isMainCheckout?: () => Promise<boolean>
  resolveModel?: (harness: Harness, sessionId: string) => Promise<string | undefined>
  username?: () => string
}

async function defaultGitToplevel(): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'])
  return stdout.trim()
}

/** Git-native main checkout: `--git-dir` equals `--git-common-dir`. This does not
 * apply the disposable-path exemption used by `worktree_resource_is_main`. */
async function defaultIsMainCheckout(): Promise<boolean> {
  const [gitDir, commonDir] = await Promise.all([
    execFileAsync('git', ['rev-parse', '--git-dir']).then(r => r.stdout.trim()),
    execFileAsync('git', ['rev-parse', '--git-common-dir']).then(r => r.stdout.trim()),
  ])
  return gitDir === commonDir
}

function detectHarness(env: NodeJS.ProcessEnv): {
  harness: Harness | 'human'
  sessionId: string | undefined
} {
  const environment = inspectHarnessEnvironment(env)
  if (environment.claude.compatMode || environment.claude.sessionId) {
    const id = environment.claude.sessionId
    return { harness: 'claude-code', sessionId: id && isValidSessionId(id) ? id : undefined }
  }
  if (environment.codex.sessionId) {
    const id = environment.codex.sessionId
    return { harness: 'codex', sessionId: isValidSessionId(id) ? id : undefined }
  }
  if (environment.cursor.agentMarker || environment.cursor.sessionId) {
    const id = environment.cursor.sessionId
    return { harness: 'cursor', sessionId: id && isValidSessionId(id) ? id : undefined }
  }
  if (environment.grok.agentMarker || environment.grok.sessionId) {
    const id = environment.grok.sessionId
    return { harness: 'grok', sessionId: id && isValidSessionId(id) ? id : undefined }
  }
  return { harness: 'human', sessionId: undefined }
}

function buildAgentDetail(
  harness: Harness,
  sessionId: string | undefined,
  model: string | undefined,
): string {
  const idNoun = harness === 'codex' ? 'thread' : 'session'
  const modelPart = model ? ` (${model})` : ''
  const idPart = sessionId ? ` ${idNoun} ${sessionId}` : ''
  return `${harness}${modelPart}${idPart}`
}

async function resolveWorktree(
  gitToplevel: () => Promise<string>,
  isMainCheckout: () => Promise<boolean>,
): Promise<string> {
  try {
    if (await isMainCheckout()) return 'main'
    const toplevel = await gitToplevel()
    const marker = '/worktrees/'
    const markerIndex = toplevel.indexOf(marker)
    return markerIndex === -1 ? basename(toplevel) : toplevel.slice(markerIndex + marker.length)
  } catch {
    return 'main'
  }
}

export async function resolveProvenance(deps: ProvenanceDeps = {}): Promise<Provenance> {
  const env = deps.env ?? process.env
  const hostnameFn = deps.hostname ?? osHostname
  const usernameFn =
    deps.username ??
    (() => {
      try {
        return userInfo().username
      } catch {
        return env.USER || env.USERNAME || 'unknown'
      }
    })
  const gitToplevel = deps.gitToplevel ?? defaultGitToplevel
  const isMainCheckout = deps.isMainCheckout ?? defaultIsMainCheckout
  const resolveModel = deps.resolveModel ?? resolveModelFromTranscript

  const { harness, sessionId } = detectHarness(env)
  const device = `${usernameFn()}@${hostnameFn().toLowerCase()}`
  const worktree = await resolveWorktree(gitToplevel, isMainCheckout)

  let model: string | undefined
  if (harness !== 'human' && sessionId) {
    try {
      model = await resolveModel(harness, sessionId)
    } catch {
      model = undefined
    }
  }

  const agent = harness === 'human' ? 'human' : buildAgentDetail(harness, sessionId, model)
  return { agent, device, worktree }
}

export function renderProvenanceLines(p: Provenance): string[] {
  return [`Agent: ${p.agent}`, `Device: ${p.device}`, `Worktree: ${p.worktree}`]
}

/** Convenience for callers (`pr-description.mts`) that just want a body with provenance applied. */
export async function injectResolvedProvenance(body: string): Promise<string> {
  return injectProvenance(body, renderProvenanceLines(await resolveProvenance()))
}

/** Local drafts never carry hand-authored provenance; a live PR body must be judged as-is. */
export async function resolveValidationBody(sourced: BodySource): Promise<string> {
  return sourced.source === 'pr' ? sourced.body : injectResolvedProvenance(sourced.body)
}
