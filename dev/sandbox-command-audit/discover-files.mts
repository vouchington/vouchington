import { globSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { isWithinRepoRoots } from './repo-scope.mts'
import { claudeProjectCwdResolver, readTranscriptCwd } from './transcript-cwd.mts'
import type { SkipCounts } from './types.mts'

export type DiscoverOptions = {
  projectsDir: string
  codexSessionsDir: string
  maxFilesPerRoot: number
  // Optional day-window: files last modified before `now - sinceDays` are dropped
  // before the most-recently-modified cap is applied. `now` is passed in (rather than
  // read via Date.now()) so this stays testable with fixed clocks.
  sinceDays?: number
  now?: number
  // Narrows discovery to a single session's transcript(s) — mirrors
  // dev/retrospective-transcript-facts/resolve.mts's session-scoped globs. Validated
  // with agent-session-id/valid-id.mts before it ever reaches here. An explicit
  // session id is already an exact target, so it bypasses repo scoping below — a
  // caller asking for one specific session should never lose it to an unresolved cwd.
  sessionId?: string
  // Repo roots to scope discovery to (see repo-scope.mts's resolveRepoRoots). An empty
  // array means "no scoping requested" and preserves the old purely-mtime-based
  // selection — real callers (sandbox-command-audit.mts) always resolve at least one
  // root before calling in.
  repoRoots: string[]
}

export type DiscoveredFiles = {
  claudeFiles: string[]
  codexFiles: string[]
  skippedOtherRepo: SkipCounts
  skippedUnknownCwd: SkipCounts
}

type StatEntry = { path: string; mtimeMs: number }

const DAY_MS = 24 * 60 * 60 * 1000

// Stats every candidate, drops anything outside the sinceDays window, and sorts by
// mtime descending — without slicing to a limit yet. The limit is applied by the
// caller *after* repo scoping (see selectInRepo), never before: applying it here would
// dilute a small --limit with other repos' files (crux of the #9406 fix — with 6401
// real Codex transcripts and a default --limit 50, an unscoped cap could return almost
// entirely other-repo files on a Vouchington-quiet week).
function statAndSort(paths: string[], cutoffMs: number | undefined): StatEntry[] {
  const entries: StatEntry[] = []
  for (const path of paths) {
    try {
      entries.push({ path, mtimeMs: statSync(path).mtimeMs })
    } catch {
      // A file removed between glob and stat (e.g. a session rotated out) is skipped.
      // Any other stat error (e.g. a permissions issue) is skipped too, by design — this
      // is a best-effort discovery pass, not a validating one, matching
      // extractCodexRecords's best-effort skip-on-error pattern elsewhere in this tool.
    }
  }
  const inWindow =
    cutoffMs === undefined ? entries : entries.filter(entry => entry.mtimeMs >= cutoffMs)
  return inWindow.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

type SelectResult = { files: string[]; skippedOtherRepo: number; skippedUnknownCwd: number }

// Lazy walk down the mtime-sorted list, resolving each file's cwd and keeping in-repo
// ones until `limit` is reached. On a machine where this repo is the active one, recent
// files are overwhelmingly its own, so this typically reads a few hundred prefixes, not
// every candidate. Worst case is the opposite: this repo quiet while others are active
// — then the walk resolves cwd for most or all of the corpus before `limit` in-repo
// files turn up, and skip counts (skippedOtherRepo/skippedUnknownCwd) are lower bounds
// on what exists, not totals, since the walk stops as soon as `limit` is reached. A file
// whose cwd can't be resolved (read error, malformed content, no cwd field anywhere) is
// excluded — fail closed — but always counted, never silently dropped.
export async function selectInRepo(
  entries: StatEntry[],
  limit: number,
  repoRoots: string[],
  resolveCwd: (path: string) => Promise<string | undefined>,
): Promise<SelectResult> {
  const files: string[] = []
  let skippedOtherRepo = 0
  let skippedUnknownCwd = 0
  for (const entry of entries) {
    if (files.length >= limit) break
    let cwd: string | undefined
    try {
      // oxlint-disable-next-line no-await-in-loop
      cwd = await resolveCwd(entry.path)
    } catch {
      cwd = undefined
    }
    if (cwd === undefined) {
      skippedUnknownCwd++
      continue
    }
    // oxlint-disable-next-line no-await-in-loop
    if (!(await isWithinRepoRoots(cwd, repoRoots))) {
      skippedOtherRepo++
      continue
    }
    files.push(entry.path)
  }
  return { files, skippedOtherRepo, skippedUnknownCwd }
}

async function discoverForRoot(
  paths: string[],
  options: DiscoverOptions,
  resolveCwd: (path: string) => Promise<string | undefined>,
): Promise<SelectResult> {
  const cutoffMs =
    options.sinceDays === undefined
      ? undefined
      : (options.now ?? Date.now()) - options.sinceDays * DAY_MS
  const sorted = statAndSort(paths, cutoffMs)
  const scoped = options.sessionId === undefined && options.repoRoots.length > 0
  if (!scoped) {
    return {
      files: sorted.slice(0, options.maxFilesPerRoot).map(entry => entry.path),
      skippedOtherRepo: 0,
      skippedUnknownCwd: 0,
    }
  }
  return selectInRepo(sorted, options.maxFilesPerRoot, options.repoRoots, resolveCwd)
}

// Globs recursively under each root — this picks up both top-level session files
// (<projectsDir>/<project>/<session>.jsonl) and subagent transcripts
// (<projectsDir>/<project>/<session>/subagents/agent-*.jsonl) in one pass, since a
// subagent transcript uses the same Claude JSONL schema as its parent and needs no
// special-cased handling in the extractor.
//
// When sessionId is set, both roots narrow to that session's file(s) instead of
// scanning everything, mirroring resolve.mts's session-scoped globs. Claude needs
// two separate patterns rather than one broader glob: the top-level transcript
// (<projectsDir>/**/<id>.jsonl) and its subagent transcripts
// (<projectsDir>/**/<id>/subagents/*.jsonl) live under different path shapes, and a
// single `**/<id>*.jsonl`-style glob would also match unrelated sessions that merely
// share a prefix.
function claudeGlobPatterns(options: DiscoverOptions): string[] {
  if (options.sessionId === undefined) {
    return [join(options.projectsDir, '**', '*.jsonl').replace(/\\/g, '/')]
  }
  return [
    join(options.projectsDir, '**', `${options.sessionId}.jsonl`).replace(/\\/g, '/'),
    join(options.projectsDir, '**', options.sessionId, 'subagents', '*.jsonl').replace(/\\/g, '/'),
  ]
}

function codexGlobPatterns(options: DiscoverOptions): string[] {
  if (options.sessionId === undefined) {
    return [join(options.codexSessionsDir, '**', '*.jsonl').replace(/\\/g, '/')]
  }
  return [
    join(options.codexSessionsDir, '**', `rollout-*-${options.sessionId}.jsonl`).replace(
      /\\/g,
      '/',
    ),
  ]
}

export async function discoverTranscriptFiles(options: DiscoverOptions): Promise<DiscoveredFiles> {
  const claudePaths = claudeGlobPatterns(options).flatMap(pattern => globSync(pattern))
  const codexPaths = codexGlobPatterns(options).flatMap(pattern => globSync(pattern))
  const resolveClaudeCwd = claudeProjectCwdResolver(options.projectsDir)

  const [claude, codex] = await Promise.all([
    discoverForRoot(claudePaths, options, resolveClaudeCwd),
    discoverForRoot(codexPaths, options, readTranscriptCwd),
  ])

  return {
    claudeFiles: claude.files,
    codexFiles: codex.files,
    skippedOtherRepo: { claude: claude.skippedOtherRepo, codex: codex.skippedOtherRepo },
    skippedUnknownCwd: { claude: claude.skippedUnknownCwd, codex: codex.skippedUnknownCwd },
  }
}
