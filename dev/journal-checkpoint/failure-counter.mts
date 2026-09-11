import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'

// Session+worktree-scoped record of recent high-signal command failures, feeding
// journal-checkpoint's checkpoint 2 (#9337: "every 3rd matching failure"). Keyed the same way
// other session-scoped tmpdir markers in this codebase are: sha256(worktreeRoot\nsessionId) under
// tmpdir(), so a blank sessionId always returns null rather than falling back to a single
// shared-global counter. Also uses the same 12h staleness ceiling — a counter file left over from
// a previous, long-finished session must not make failure #1 of a new session read as the 3rd.
const COUNTER_TTL_MS = 12 * 60 * 60 * 1000
const MAX_TRACKED_FAILURES = 3

export type FailureRecord = { command: string; stderrHead: string }
type CounterState = { count: number; failures: FailureRecord[]; updatedAt: number }

export function counterPath(
  sessionId: string,
  worktreeRoot: string,
  baseDir: string = tmpdir(),
): string | null {
  if (sessionId === '') return null
  const key = createHash('sha256').update(`${worktreeRoot}\n${sessionId}`).digest('hex')
  return path.join(baseDir, `journal-checkpoint-failures-${key}.json`)
}

function readState(file: string): CounterState {
  try {
    const stat = statSync(file)
    if (Date.now() - stat.mtimeMs > COUNTER_TTL_MS) return { count: 0, failures: [], updatedAt: 0 }
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<CounterState>
    return {
      count: typeof parsed.count === 'number' ? parsed.count : 0,
      failures: Array.isArray(parsed.failures) ? parsed.failures : [],
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    }
  } catch {
    return { count: 0, failures: [], updatedAt: 0 }
  }
}

export type RecordFailureResult = { count: number; failures: FailureRecord[] }

/**
 * Records one high-signal command failure and returns the running count plus the last
 * MAX_TRACKED_FAILURES records. Returns null (never writes) for a blank sessionId, mirroring
 * markerPath's fail-safe contract. Callers append a journal entry when count % 3 === 0.
 */
export function recordFailure(
  sessionId: string,
  worktreeRoot: string,
  failure: FailureRecord,
  baseDir: string = tmpdir(),
): RecordFailureResult | null {
  const file = counterPath(sessionId, worktreeRoot, baseDir)
  if (file === null) return null
  const state = readState(file)
  const failures = [...state.failures, failure].slice(-MAX_TRACKED_FAILURES)
  const next: CounterState = { count: state.count + 1, failures, updatedAt: Date.now() }
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(next))
  return { count: next.count, failures: next.failures }
}
