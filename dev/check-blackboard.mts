#!/usr/bin/env node
import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'

import { cursorPayloadSessionId } from './agent-session-id/persist.mts'

const execFileAsync = promisify(execFileCb)

// SessionStart hook: prints the hook's own session id, which every vouchington-tooling journal tool
// takes as an explicit `sessionId`, and an advisory probe of the hosted deployment. Compact
// restarts and CHECK_BLACKBOARD_SKIP skip the probe only; the session id is always re-printed.
// The vouchington-tooling MCP server is registered per machine, not by this repository, so the
// hook can only say that the deployment is unreachable, never that a harness failed to connect.

export async function runCheckBlackboard(options: { env?: NodeJS.ProcessEnv } = {}): Promise<void> {
  const { probeBlackboard } = await loadBlackboardModules()
  try {
    await probeBlackboard(options.env)
  } catch (err) {
    throw new Error(
      `sessions list probe failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    )
  }
}

// Thrown for a workspace-setup problem (package missing or an incompatible version resolved),
// never for a probe/credential failure — main() uses this to pick the right remediation text.
class BlackboardModuleUnavailableError extends Error {}

async function loadBlackboardModules() {
  try {
    return await import('vouchington-tooling/agent-blackboard')
  } catch (err) {
    if (!(err instanceof Error) || !('code' in err)) throw err
    const mentionsBlackboardPackage =
      err.message.includes('vouchington-tooling') || err.message.includes('agent-blackboard')
    if (err.code === 'ERR_MODULE_NOT_FOUND' && mentionsBlackboardPackage) {
      throw new BlackboardModuleUnavailableError(
        'vouchington-tooling agent-blackboard helpers are not installed; run pnpm install from the Vouchington worktree root',
        { cause: err },
      )
    }
    // A resolved vouchington-tooling install that predates the ./agent-blackboard export — e.g. an
    // uninitialized worktree falling back to a stale copy hoisted from elsewhere on disk. This is a
    // workspace-setup defect, not the package being absent, and needs a different fix (reinstall the
    // worktree's own dependencies, not just "pnpm install").
    if (err.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED' && mentionsBlackboardPackage) {
      throw new BlackboardModuleUnavailableError(
        'vouchington-tooling resolved an installed copy that predates the ./agent-blackboard export ' +
          '(a stale or incorrectly hoisted install, not a missing package); run ./dev/initialize monorepo ' +
          'from the Vouchington worktree root',
        { cause: err },
      )
    }
    throw err
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

// Returns the advisory line for the deployment probe, or undefined when the probe is skipped or
// healthy.
async function probeAdvisory(payload: Record<string, unknown>): Promise<string | undefined> {
  if (payload.source === 'compact') return undefined
  if (process.env.CHECK_BLACKBOARD_SKIP === '1') return undefined

  // The Claude Code sandbox unsets AGENT_BLACKBOARD_TOKEN (sandbox.credentials.envVars
  // deny; docs/development/agent-sandbox.md#sandbox-credential-deny-list) and blocks egress
  // to the deployment, so a sandboxed run cannot tell "the deployment is down" apart from
  // "I was never given the credential to check". Reporting that as an outage is a false
  // stop-work directive — see docs/development/agent-blackboard.md.
  if (process.env.SANDBOX_RUNTIME) {
    return (
      'agent-blackboard probe skipped: it ran inside the Claude Code sandbox, which unsets ' +
      'AGENT_BLACKBOARD_TOKEN and blocks egress to the deployment. This is NOT an outage and ' +
      'NOT a reason to stop work. Re-run unsandboxed to actually verify the deployment.'
    )
  }

  try {
    await runCheckBlackboard()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (err instanceof BlackboardModuleUnavailableError) {
      return (
        `agent-blackboard helpers are unavailable (${message}). This is a workspace-setup ` +
        'problem in this worktree, not a deployment outage — the hosted agent-blackboard ' +
        'deployment and AGENT_BLACKBOARD_URL/AGENT_BLACKBOARD_TOKEN are not the cause and do not ' +
        'need checking. Run the command above from the Vouchington worktree root, then continue ' +
        'the task in this session. Journaling does not need this worktree install: search for ' +
        '`journal_append`, and when the server is not connected use the CLI fallback in the ' +
        'blackboard skill and tell the user you are falling back.'
      )
    }
    return (
      `agent-blackboard availability assessment failed (${message}). Interactive feedback can ` +
      'continue through the supported durable outbox; delivery remains visibly pending. ' +
      'Verify the hosted agent-blackboard ' +
      'deployment is reachable and AGENT_BLACKBOARD_URL and ' +
      'AGENT_BLACKBOARD_TOKEN are exported and valid (see docs/development/agent-blackboard.md), ' +
      'then start a fresh session. If the vouchington-tooling server is not connected, use the ' +
      'CLI fallback in the blackboard skill and tell the user you are falling back.'
    )
  }
  return undefined
}

async function main(): Promise<void> {
  const payload = await readStdinPayload()
  if (!(await isGitRepo())) return

  const lines: string[] = []
  const sessionId = cursorPayloadSessionId(payload)
  if (sessionId) {
    lines.push(
      `Blackboard sessionId: ${sessionId} (pass it as \`sessionId\` to every journal tool)`,
    )
  }
  const probe = await probeAdvisory(payload)
  if (probe !== undefined) lines.push(probe)
  if (lines.length > 0) emitContext(lines.join('\n'))
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    process.stderr.write(
      `check-blackboard failed: ${err instanceof Error ? err.message : String(err)}\n`,
    )
  })
}
