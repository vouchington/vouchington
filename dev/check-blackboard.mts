#!/usr/bin/env node
import { execFile as execFileCb } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFileCb)
type BlackboardSessionsClient = import('./blackboard/client.mts').BlackboardSessionsClient

// Called by Claude Code and Codex hooks at session start; stdout is injected as context.
// Blackboard is a hard session prerequisite (journaling/retrospective/distill all depend
// on it), so an unreachable deployment surfaces as a stop-work directive here — the
// primary signal from the plan's stop-work gate. The mid-session backstop is that every
// session_create/entry_append hard-fails with no filesystem fallback (see
// dev/blackboard-journal.mts); this hook only reflects state as of session start.
//
// Environment:
//   CHECK_BLACKBOARD_SKIP=1  Skip the probe entirely (for offline/CI tests).

export async function runCheckBlackboard(
  options: { env?: NodeJS.ProcessEnv; sessions?: BlackboardSessionsClient } = {},
): Promise<void> {
  const { probeBlackboard, clientDependencies } = await loadBlackboardModules()
  try {
    await probeBlackboard(options.env, clientDependencies({ sessions: options.sessions }))
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
    const [portableBlackboard, client] = await Promise.all([
      import('vouchington-tooling/agent-blackboard'),
      import('./blackboard/client.mts'),
    ])
    return { ...portableBlackboard, ...client }
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error)) throw error
    const mentionsBlackboardPackage =
      error.message.includes('vouchington-tooling') || error.message.includes('agent-blackboard')
    if (error.code === 'ERR_MODULE_NOT_FOUND' && mentionsBlackboardPackage) {
      throw new BlackboardModuleUnavailableError(
        'vouchington-tooling agent-blackboard helpers are not installed; run pnpm install from the Filaments worktree root',
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
          'from the Filaments worktree root',
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

  // The Claude Code sandbox unsets AGENT_BLACKBOARD_TOKEN (sandbox.credentials.envVars
  // "deny") and blocks egress to the deployment, so a sandboxed run cannot tell "the
  // deployment is down" apart from "I was never given the credential to check". Reporting
  // that as an outage is a false stop-work directive — see docs/development/agent-blackboard.md.
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
          'need checking. Run the command above from the Filaments worktree root, then start a ' +
          'fresh session.',
      )
      return
    }
    emitContext(
      `STOP WORK: agent-blackboard is unavailable (${message}). Blackboard is a hard ` +
        'session prerequisite — journaling, retrospectives, and distillation all depend on it. ' +
        'Do not proceed with the task. Tell the user to verify the hosted agent-blackboard ' +
        'deployment is reachable and AGENT_BLACKBOARD_URL and ' +
        'AGENT_BLACKBOARD_TOKEN are exported and valid (see docs/development/agent-blackboard.md), ' +
        'then start a fresh session.',
    )
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `check-blackboard failed: ${error instanceof Error ? error.message : String(error)}\n`,
    )
  })
}
