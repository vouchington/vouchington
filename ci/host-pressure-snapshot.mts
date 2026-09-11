/**
 * Shared host pressure/contention snapshot, captured unconditionally at the start of a locked
 * `next build` -- not gated behind `--failure-diagnostics` -- so a healthy-but-slow run still
 * records the pressure context needed to re-derive `VOUCHA_BUILD_LOCK_COMMAND_TIMEOUT_SECONDS`
 * from real evidence instead of a copied-forward number (see docs/development/host-locks.md and
 * issue #10937).
 *
 * Reused by both locked-build code paths so collection logic lives in exactly one place:
 * - ci/setup-web-integration.mts (the `build-web-targets` composite action path)
 * - the static-web build-window instrumentation invoked from checks-static.yml
 *
 * Delegates collection to the packaged ci/host-pressure-diagnostics.sh wrapper -- never
 * re-implements platform-branching diagnostics here. That wrapper prints unstructured, sectioned
 * text (not JSON) and differs by platform: this repo's fleet is self-hosted macOS (Darwin)
 * runners, which have no Linux PSI (`/proc/pressure`) fields, so callers must treat `output` as
 * opaque platform-dependent text, not a parsed/typed shape.
 *
 * Never throws and never fails the caller: a missing or failing packaged helper degrades to
 * `ok: false` with a diagnostic message in `output`.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'

export interface HostPressureSnapshot {
  /** ISO timestamp captured immediately before invoking the packaged helper. */
  capturedAt: string
  /** False when the helper produced no usable diagnostic text (missing helper, spawn error, or empty stdout). */
  ok: boolean
  /** Raw, unstructured diagnostic text (or a fallback message when unavailable). */
  output: string
}

const SCRIPT_PATH = path.join(import.meta.dirname, 'host-pressure-diagnostics.sh')
const CAPTURE_TIMEOUT_MS = 10_000

/**
 * Non-blocking: callers that must stay reactive to a concurrently-running child process's own
 * stdio -- e.g. a `next build` stderr listener -- would otherwise stall that process's pipe for up
 * to `CAPTURE_TIMEOUT_MS` if collection blocked the event loop (see ci/setup-web-integration.mts).
 *
 * There is deliberately no synchronous (`spawnSync`-based) sibling: `spawnSync`'s own `timeout`
 * option only ever signals the exact child pid it spawned, with no way to target its process
 * group, so a descendant the packaged helper forks (e.g. a `ps`/pipe stage) can hold the pipe open
 * and block the synchronous call itself past the advertised timeout. This version can reliably
 * enforce it below by spawning detached and killing the whole group.
 */
export function captureHostPressureSnapshotAsync(): Promise<HostPressureSnapshot> {
  const capturedAt = new Date().toISOString()

  return new Promise(resolve => {
    let settled = false
    const settle = (result: HostPressureSnapshot): void => {
      if (settled) return
      settled = true
      resolve(result)
    }

    let child
    try {
      // `detached: true` makes this process the leader of its own process group (POSIX setsid),
      // so a timeout can kill the whole group -- not just this direct shell -- below. Without it,
      // a descendant the helper forks (e.g. a `ps`/pipe stage inside the packaged diagnostics
      // script) survives `child.kill()` as an orphan holding stdout/stderr open, which can keep
      // this Node process alive past the advertised timeout even though the promise already
      // settled.
      child = spawn('bash', [SCRIPT_PATH], { detached: true })
    } catch (error) {
      settle({
        capturedAt,
        ok: false,
        output: `host-pressure-snapshot: ${error instanceof Error ? error.message : String(error)}`,
      })
      return
    }

    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    const timer = setTimeout(() => {
      // SIGKILL the whole process group (negative pid), not just this direct child, so a
      // descendant that outlived a plain `child.kill()` can no longer hold stdout/stderr open
      // and stall this Node process's own exit past the timeout this is meant to enforce.
      if (typeof child.pid === 'number') {
        try {
          // oxlint-disable-next-line no-restricted-properties -- terminates the detached diagnostics process group, not a self-signal
          process.kill(-child.pid, 'SIGKILL')
        } catch {
          child.kill('SIGKILL')
        }
      } else {
        child.kill('SIGKILL')
      }
      settle({ capturedAt, ok: false, output: 'host-pressure-snapshot: timed out' })
    }, CAPTURE_TIMEOUT_MS)
    timer.unref()

    child.once('error', error => {
      clearTimeout(timer)
      settle({ capturedAt, ok: false, output: `host-pressure-snapshot: ${error.message}` })
    })

    child.once('close', status => {
      clearTimeout(timer)
      const output = stdout.trim()
      if (output === '') {
        settle({
          capturedAt,
          ok: false,
          output:
            stderr.trim() !== '' ? stderr.trim() : 'host-pressure-snapshot: no output captured',
        })
        return
      }
      settle({ capturedAt, ok: status === 0, output })
    })
  })
}
