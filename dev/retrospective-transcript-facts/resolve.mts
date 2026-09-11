import { existsSync, globSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import {
  inspectHarnessEnvironment,
  selectHarnessSession,
} from 'vouchington-tooling/agent-harness-identity'
import { isValidSessionId } from '../agent-session-id/valid-id.mts'

export { openTranscriptLines } from './transcript-lines.mts'

export type TranscriptResolveOptions = {
  sessionIdArg?: string
  env?: NodeJS.ProcessEnv
  projectsDir?: string
  codexSessionsDir?: string
  grokSessionsDir?: string
  cwd?: string
  jsonlPath?: string
}

export function resolveTranscriptSessionId(
  options: TranscriptResolveOptions = {},
): string | undefined {
  if (options.sessionIdArg) return options.sessionIdArg
  const env = options.env ?? process.env
  return selectHarnessSession(inspectHarnessEnvironment(env), ['codex', 'claude', 'cursor', 'grok'])
    ?.sessionId
}

export type ResolvedTranscript = { path: string; sessionId: string } | { error: string }

export function resolveTranscriptFile(options: TranscriptResolveOptions = {}): ResolvedTranscript {
  if (options.jsonlPath) {
    // Prefer the file's own basename over an ambient CLAUDE_CODE_SESSION_ID: a
    // recovered/detached --jsonl file belongs to a different session than the one
    // currently running, so falling back to the current env var would mislabel
    // provenance in the emitted block.
    const sessionId = options.sessionIdArg ?? (basename(options.jsonlPath, '.jsonl') || 'unknown')
    return { path: options.jsonlPath, sessionId }
  }

  const sessionId = resolveTranscriptSessionId(options)
  if (!sessionId) {
    return {
      error:
        'no session id (set CURSOR_SESSION_ID, GROK_SESSION_ID, CODEX_THREAD_ID, or CLAUDE_CODE_SESSION_ID, or pass --session-id)',
    }
  }
  if (!isValidSessionId(sessionId)) {
    return { error: `invalid session id format: ${sessionId}` }
  }

  const env = options.env ?? process.env
  const grokHome = env.GROK_HOME && env.GROK_HOME !== '' ? env.GROK_HOME : join(homedir(), '.grok')
  const grokSessionsDir = options.grokSessionsDir ?? join(grokHome, 'sessions')
  const encodedCwd = encodeURIComponent(options.cwd ?? process.cwd())
  const grokExact = join(grokSessionsDir, encodedCwd, sessionId, 'updates.jsonl')
  const grokPattern = join(grokSessionsDir, '*', sessionId, 'updates.jsonl').replace(/\\/g, '/')
  const grokMatch = existsSync(grokExact) ? grokExact : globSync(grokPattern)[0]

  const codexSessionsDir = options.codexSessionsDir ?? join(homedir(), '.codex', 'sessions')
  const projectsDir = options.projectsDir ?? join(homedir(), '.claude', 'projects')
  const codexPattern = join(codexSessionsDir, '**', `rollout-*-${sessionId}.jsonl`).replace(
    /\\/g,
    '/',
  )
  const claudePattern = join(projectsDir, '*', `${sessionId}.jsonl`).replace(/\\/g, '/')
  const match = grokMatch ?? globSync(codexPattern)[0] ?? globSync(claudePattern)[0]
  if (!match) {
    return {
      error: `no transcript found for session ${sessionId} under ${grokSessionsDir}, ${codexSessionsDir}, or ${projectsDir}`,
    }
  }
  return { path: match, sessionId }
}

// Subagent activity lives in a sibling `<mainJsonlPath-without-ext>/subagents/*.jsonl`
// directory rather than inline in the main transcript (empirically confirmed against
// a real ~/.claude/projects/**/ session dir). Each record in those files already
// carries `isSidechain: true`, so feeding their lines into computeTranscriptFacts
// alongside the main transcript's lines counts them correctly with no extra logic.
export function resolveSubagentJsonlPaths(mainJsonlPath: string): string[] {
  const sessionDir = join(dirname(mainJsonlPath), basename(mainJsonlPath, '.jsonl'))
  const pattern = join(sessionDir, 'subagents', '*.jsonl').replace(/\\/g, '/')
  return globSync(pattern)
}
