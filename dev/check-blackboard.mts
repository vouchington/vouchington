#!/usr/bin/env node
import { execFile as execFileCb } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import {
  checkMcpLaunch,
  renderMcpHealthLine,
  type McpRuntime,
} from './check-blackboard/mcp-health.mts'
import { renderSessionLine } from './check-blackboard/session-line.mts'

const execFileAsync = promisify(execFileCb)

// SessionStart hook: prints the session id agents pass to the vouchington-tooling MCP tools, a
// static launch-health line, and an advisory probe of the hosted deployment. Compact restarts
// and CHECK_BLACKBOARD_SKIP skip the probe only; the session id is always re-printed.
// argv[2] is the harness token (`claude`, `codex` or `grok`) from the hook command. It can be
// absent: a linked worktree runs the main checkout's hook command, so the payload and env decide.

export async function runCheckBlackboard(options: { env?: NodeJS.ProcessEnv } = {}): Promise<void> {
  const { probeBlackboard } = await import('vouchington-tooling/agent-blackboard')
  try {
    await probeBlackboard(options.env)
  } catch (error) {
    throw new Error(
      `sessions list probe failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}

async function isGitRepo(): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--git-dir'])
    return true
  } catch {
    return false
  }
}

async function readStdinPayload(): Promise<Record<string, unknown>> {
  if (process.stdin.isTTY) return {}
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function emitContext(message: string): void {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: message },
    })}\n`,
  )
}

// Resolution loads the workspace resolver lazily: a missing or stale install must still leave
// the health line (and a "not resolved" line) rather than crash the hook. The resolved runtime
// picks the health line's tool names and reconnect step; it is unknown when resolution fails.
async function sessionContext(
  payload: Record<string, unknown>,
  root: string,
): Promise<{ line: string; runtime?: McpRuntime }> {
  try {
    const { resolveHookSession } = await import('./check-blackboard/session-id.mts')
    const session = resolveHookSession({
      cwd: root,
      env: process.env,
      harnessArg: process.argv[2],
      payload,
    })
    return { line: renderSessionLine(session.sessionId, session.failure), runtime: session.runtime }
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error)
    return { line: renderSessionLine(undefined, cause) }
  }
}

// The Claude Code sandbox unsets AGENT_BLACKBOARD_TOKEN (sandbox.credentials.envVars deny;
// docs/development/agent-sandbox.md#sandbox-credential-deny-list) and blocks egress to the
// deployment, so a sandboxed run cannot tell "the deployment is down" apart from "I was never
// given the credential to check". Reporting that as an outage is a false stop-work directive.
const SANDBOX_SKIP =
  'agent-blackboard deployment probe skipped: it ran inside the Claude Code sandbox, which unsets ' +
  'AGENT_BLACKBOARD_TOKEN and blocks egress to the deployment. This is NOT an outage and NOT a ' +
  'reason to stop work. Re-run unsandboxed to actually verify the deployment.'

async function probeLine(): Promise<string | undefined> {
  if (process.env.SANDBOX_RUNTIME) return SANDBOX_SKIP
  try {
    await runCheckBlackboard()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return (
      `Hosted agent-blackboard deployment assessment failed (${message}). Journal calls continue ` +
      'through the supported durable outbox; delivery remains visibly pending. Verify the hosted ' +
      'deployment is reachable and AGENT_BLACKBOARD_URL and AGENT_BLACKBOARD_TOKEN are exported ' +
      'and valid (see docs/development/agent-blackboard.md), then start a fresh session.'
    )
  }
  return undefined
}

async function main(): Promise<void> {
  const payload = await readStdinPayload()
  if (!(await isGitRepo())) return

  const root = resolve(import.meta.dirname, '..')
  const compact = payload.source === 'compact'
  const health = checkMcpLaunch(root)
  const session = await sessionContext(payload, root)
  const lines = [session.line]
  if (!health.ok || !compact) lines.push(renderMcpHealthLine(health, session.runtime))
  // An unlaunchable server is a setup problem that masks the deployment probe.
  if (health.ok && !compact && process.env.CHECK_BLACKBOARD_SKIP !== '1') {
    const probe = await probeLine()
    if (probe !== undefined) lines.push(probe)
  }
  emitContext(lines.join('\n'))
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `check-blackboard failed: ${error instanceof Error ? error.message : String(error)}\n`,
    )
  })
}
