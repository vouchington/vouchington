#!/usr/bin/env node
import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFileCb)

// SessionStart probes provide advisory context. CHECK_BLACKBOARD_SKIP skips that probe only.

export async function runCheckBlackboard(options: { env?: NodeJS.ProcessEnv } = {}): Promise<void> {
  const { probeBlackboard } = await loadBlackboardModules()
  try {
    await probeBlackboard(options.env)
  } catch (error) {
    throw new Error(
      `sessions list probe failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}

// Thrown for a workspace-setup problem (package missing or an incompatible version resolved),
// never for a probe/credential failure — main() uses this to pick the right remediation text.
class BlackboardModuleUnavailableError extends Error {}

async function loadBlackboardModules() {
  try {
    return await import('vouchington-tooling/agent-blackboard')
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error)) throw error
    const mentionsBlackboardPackage =
      error.message.includes('vouchington-tooling') || error.message.includes('agent-blackboard')
    if (error.code === 'ERR_MODULE_NOT_FOUND' && mentionsBlackboardPackage) {
      throw new BlackboardModuleUnavailableError(
        'vouchington-tooling agent-blackboard helpers are not installed; run pnpm install from the Vouchington worktree root',
        { cause: error },
      )
    }
    // A resolved vouchington-tooling install that predates the ./agent-blackboard export — e.g. an
    // uninitialized worktree falling back to a stale copy hoisted from elsewhere on disk. This is a
    // workspace-setup defect, not the package being absent, and needs a different fix (reinstall the
    // worktree's own dependencies, not just "pnpm install").
    if (error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED' && mentionsBlackboardPackage) {
      throw new BlackboardModuleUnavailableError(
        'vouchington-tooling resolved an installed copy that predates the ./agent-blackboard export ' +
          '(a stale or incorrectly hoisted install, not a missing package); run ./dev/initialize monorepo ' +
          'from the Vouchington worktree root',
        { cause: error },
      )
    }
    throw error
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

async function main(): Promise<void> {
  const payload = await readStdinPayload()
  if (payload.source === 'compact') return
  if (process.env.CHECK_BLACKBOARD_SKIP === '1') return
  if (!(await isGitRepo())) return

  // The machine-configured Claude Code sandbox unsets AGENT_BLACKBOARD_TOKEN (its credential env
  // deny list is host policy; docs/development/agent-sandbox.md#sandbox-credential-deny-list)
  // and blocks egress to the deployment, so a sandboxed run cannot tell "the deployment is down"
  // apart from "I was never given the credential to check". Reporting that as an outage is a
  // false stop-work directive — see docs/development/agent-blackboard.md.
  if (process.env.SANDBOX_RUNTIME) {
    emitContext(
      'agent-blackboard probe skipped: it ran inside the Claude Code sandbox, which unsets ' +
        'AGENT_BLACKBOARD_TOKEN and blocks egress to the deployment. This is NOT an outage and ' +
        'NOT a reason to stop work. Re-run unsandboxed to actually verify the deployment.',
    )
    return
  }

  try {
    await runCheckBlackboard()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (error instanceof BlackboardModuleUnavailableError) {
      emitContext(
        `STOP WORK: agent-blackboard is unavailable (${message}). This is a workspace-setup ` +
          'problem in this worktree, not a deployment outage — the hosted agent-blackboard ' +
          'deployment and AGENT_BLACKBOARD_URL/AGENT_BLACKBOARD_TOKEN are not the cause and do not ' +
          'need checking. Run the command above from the Vouchington worktree root, then start a ' +
          'fresh session.',
      )
      return
    }
    emitContext(
      `agent-blackboard availability assessment failed (${message}). Interactive feedback can ` +
        'continue through the supported durable outbox; delivery remains visibly pending. ' +
        'Verify the hosted agent-blackboard ' +
        'deployment is reachable and AGENT_BLACKBOARD_URL and ' +
        'AGENT_BLACKBOARD_TOKEN are exported and valid (see docs/development/agent-blackboard.md), ' +
        'then start a fresh session.',
    )
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `check-blackboard failed: ${error instanceof Error ? error.message : String(error)}\n`,
    )
  })
}
