/**
 * Reads the `cwd` a Claude or Codex transcript file was recorded under, for
 * dev/sandbox-command-audit/repo-scope.mts's isWithinRepoRoots to filter against. Split
 * out from repo-scope.mts (root resolution) purely to stay under the 200-line-per-file
 * cap — the two halves are used together but have no shared state.
 */

import { globSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { openTranscriptLines } from '../retrospective-transcript-facts/resolve.mts'

const PREFIX_BYTES = 64 * 1024

async function readPrefix(
  path: string,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  await using handle = await open(path, 'r')
  const buffer = Buffer.alloc(maxBytes)
  const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0)
  return { text: buffer.toString('utf8', 0, bytesRead), truncated: bytesRead === maxBytes }
}

function cwdFromRecord(record: unknown): string | undefined {
  if (typeof record !== 'object' || record === null) return undefined
  const top = (record as { cwd?: unknown }).cwd
  if (typeof top === 'string' && top.length > 0) return top
  const payload = (record as { payload?: { cwd?: unknown } }).payload
  const nested = payload?.cwd
  return typeof nested === 'string' && nested.length > 0 ? nested : undefined
}

// Only complete lines are safe to JSON.parse — a prefix read almost always truncates
// the final line mid-object, so that fragment is dropped rather than attempted.
function extractCwdFromText(text: string, dropLastLine: boolean): string | undefined {
  const lines = text.split('\n')
  const complete = dropLastLine ? lines.slice(0, -1) : lines
  for (const line of complete) {
    if (line.length === 0) continue
    try {
      const cwd = cwdFromRecord(JSON.parse(line))
      if (cwd !== undefined) return cwd
    } catch {
      // A malformed/partial line is skipped — cwd is read best-effort, matching
      // extractCodexRecords's best-effort skip-on-error pattern elsewhere in this tool.
    }
  }
  return undefined
}

/**
 * The first `cwd` found in a transcript file — top-level (Claude `system`/`user`/
 * `assistant` records) or at `payload.cwd` (Codex `session_meta`, always line 1).
 * Reads only a bounded 64 KB prefix (`open` + `read`) and escalates to a streamed
 * full-file scan only when that prefix is itself
 * truncated and still yields nothing — most transcripts carry their cwd in the first
 * line or two, so the escalation path is rare. First-cwd-wins: a session that starts in
 * one repo and later `cd`s into another is bucketed entirely by its earliest recorded
 * cwd, so commands run after that `cd` are misattributed to the wrong repo — fail-closed
 * and counted in `skippedOtherRepo`/`skippedUnknownCwd` rather than silently dropped, but
 * still lossy; per-record cwd attribution would be the precise fix.
 */
export async function readTranscriptCwd(path: string): Promise<string | undefined> {
  const prefix = await readPrefix(path, PREFIX_BYTES)
  const fromPrefix = extractCwdFromText(prefix.text, prefix.truncated)
  if (fromPrefix !== undefined || !prefix.truncated) return fromPrefix
  const opened = await openTranscriptLines(path)
  if ('error' in opened) throw new Error(opened.error)
  for await (const line of opened.lines) {
    if (line.length === 0) continue
    try {
      const cwd = cwdFromRecord(JSON.parse(line))
      if (cwd !== undefined) return cwd
    } catch {
      // A malformed line is skipped, matching prefix parsing.
    }
  }
  return undefined
}

async function resolveProjectCwd(
  projectsDir: string,
  projectDir: string,
): Promise<string | undefined> {
  // Prefer a top-level session file (<projectsDir>/<projectDir>/<id>.jsonl) — the
  // canonical source of this project's cwd — over reading the (possibly subagent)
  // file that triggered this lookup: a subagent transcript under
  // <session>/subagents/ may not carry a cwd of its own.
  //
  // globSync's order is filesystem-dependent, not mtime- or name-sorted, so this
  // returns the first entry that happens to yield a cwd, not necessarily the most
  // recent session. That's fine for the common case — every session under one encoded
  // project directory shares the same cwd by construction — but if a project directory
  // ever legitimately spans more than one cwd (e.g. a worktree path reused after a
  // rename), whichever session file glob visits first wins, silently.
  let entries: string[]
  try {
    entries = globSync(join(projectsDir, projectDir, '*.jsonl').replace(/\\/g, '/'))
  } catch {
    entries = []
  }
  for (const entry of entries) {
    // oxlint-disable-next-line no-await-in-loop
    const cwd = await readTranscriptCwd(entry)
    if (cwd !== undefined) return cwd
  }
  return undefined
}

/**
 * Memoizes cwd resolution per Claude project directory (the path segment directly
 * under `projectsDir`): every session in one encoded-cwd project dir shares a cwd, so
 * resolving once per project dir — rather than once per file — amortizes ~1600 real
 * transcript files down to the handful of distinct project dirs, and resolves a
 * subagent transcript's cwd by proxy through its project's top-level session files
 * instead of failing on the subagent file's own (possibly absent) cwd. The directory
 * name itself is never decoded — Claude's encoding (`-Users-someone-project`) is lossy
 * and would over-match sibling repos. Only a *fulfilled* resolution is kept cached: if
 * `resolveProjectCwd` rejects (e.g. a transient read error on one of its session
 * files), the rejected promise is evicted immediately so the next lookup for that
 * project directory retries from scratch instead of permanently rejecting.
 */
export function claudeProjectCwdResolver(
  projectsDir: string,
): (path: string) => Promise<string | undefined> {
  const cache = new Map<string, Promise<string | undefined>>()
  return async (path: string) => {
    const rel = relative(projectsDir, path)
    const projectDir = rel.split(sep)[0] ?? rel
    let resolved = cache.get(projectDir)
    if (resolved === undefined) {
      resolved = resolveProjectCwd(projectsDir, projectDir)
      resolved.catch(() => cache.delete(projectDir))
      cache.set(projectDir, resolved)
    }
    return resolved
  }
}
