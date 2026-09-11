import { mkdtempSync, mkdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { discoverTranscriptFiles } from '../discover-files.mts'

function makeFile(path: string, mtime: Date): void {
  writeFileSync(path, '{}\n')
  utimesSync(path, mtime, mtime)
}

describe('discoverTranscriptFiles', () => {
  let root: string

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it('globs top-level session files and nested subagent transcripts under each root', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-discover-'))
    const projectsDir = join(root, 'claude-projects')
    const codexSessionsDir = join(root, 'codex-sessions')
    const subagentsDir = join(projectsDir, 'proj-a', 'session-1', 'subagents')
    mkdirSync(subagentsDir, { recursive: true })
    mkdirSync(codexSessionsDir, { recursive: true })

    makeFile(join(projectsDir, 'proj-a', 'session-1.jsonl'), new Date('2026-01-01'))
    makeFile(join(subagentsDir, 'agent-1.jsonl'), new Date('2026-01-02'))
    makeFile(join(codexSessionsDir, 'rollout-1.jsonl'), new Date('2026-01-01'))

    const result = await discoverTranscriptFiles({
      projectsDir,
      codexSessionsDir,
      maxFilesPerRoot: 50,
      repoRoots: [],
    })

    expect(result.claudeFiles).toHaveLength(2)
    expect(result.claudeFiles.some(path => path.endsWith('session-1.jsonl'))).toBe(true)
    expect(result.claudeFiles.some(path => path.endsWith('agent-1.jsonl'))).toBe(true)
    expect(result.codexFiles).toEqual([join(codexSessionsDir, 'rollout-1.jsonl')])
  })

  it('caps each root independently to the N most-recently-modified files', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-discover-'))
    const projectsDir = join(root, 'claude-projects')
    const codexSessionsDir = join(root, 'codex-sessions')
    mkdirSync(projectsDir, { recursive: true })
    mkdirSync(codexSessionsDir, { recursive: true })

    makeFile(join(projectsDir, 'oldest.jsonl'), new Date('2026-01-01'))
    makeFile(join(projectsDir, 'middle.jsonl'), new Date('2026-01-02'))
    makeFile(join(projectsDir, 'newest.jsonl'), new Date('2026-01-03'))

    const result = await discoverTranscriptFiles({
      projectsDir,
      codexSessionsDir,
      maxFilesPerRoot: 2,
      repoRoots: [],
    })

    expect(result.claudeFiles).toEqual([
      join(projectsDir, 'newest.jsonl'),
      join(projectsDir, 'middle.jsonl'),
    ])
  })

  it('drops files outside the sinceDays window using the injected clock', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-discover-'))
    const projectsDir = join(root, 'claude-projects')
    const codexSessionsDir = join(root, 'codex-sessions')
    mkdirSync(projectsDir, { recursive: true })
    mkdirSync(codexSessionsDir, { recursive: true })

    const now = new Date('2026-02-10').getTime()
    makeFile(join(projectsDir, 'stale.jsonl'), new Date('2026-01-01'))
    makeFile(join(projectsDir, 'fresh.jsonl'), new Date('2026-02-09'))

    const result = await discoverTranscriptFiles({
      projectsDir,
      codexSessionsDir,
      maxFilesPerRoot: 50,
      sinceDays: 7,
      now,
      repoRoots: [],
    })

    expect(result.claudeFiles).toEqual([join(projectsDir, 'fresh.jsonl')])
  })

  it('falls back to the real clock (Date.now()) when sinceDays is set but now is omitted', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-discover-'))
    const projectsDir = join(root, 'claude-projects')
    const codexSessionsDir = join(root, 'codex-sessions')
    mkdirSync(projectsDir, { recursive: true })
    mkdirSync(codexSessionsDir, { recursive: true })

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-10'))
    try {
      makeFile(join(projectsDir, 'stale.jsonl'), new Date('2026-01-01'))
      makeFile(join(projectsDir, 'fresh.jsonl'), new Date('2026-02-09'))

      const result = await discoverTranscriptFiles({
        projectsDir,
        codexSessionsDir,
        maxFilesPerRoot: 50,
        sinceDays: 7,
        repoRoots: [],
      })

      expect(result.claudeFiles).toEqual([join(projectsDir, 'fresh.jsonl')])
    } finally {
      vi.useRealTimers()
    }
  })

  // Covers statAndSort's statSync-failure skip only — a dangling symlink's target is
  // missing, so stat (which follows symlinks) throws before repo scoping ever runs
  // (repoRoots: [] here disables it anyway). This is NOT coverage of isWithinRoot's
  // symlink/path-canonicalization matching — that lives in
  // repo-scope.test.mts's "symlink canonicalization" describe blocks, exercised through
  // a symlink that resolves successfully rather than one that's broken.
  it('skips a path that disappears between glob and stat (dangling symlink target)', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-discover-'))
    const projectsDir = join(root, 'claude-projects')
    const codexSessionsDir = join(root, 'codex-sessions')
    mkdirSync(projectsDir, { recursive: true })
    mkdirSync(codexSessionsDir, { recursive: true })

    makeFile(join(projectsDir, 'real.jsonl'), new Date('2026-01-01'))
    symlinkSync(join(projectsDir, 'does-not-exist'), join(projectsDir, 'dangling.jsonl'))

    const result = await discoverTranscriptFiles({
      projectsDir,
      codexSessionsDir,
      maxFilesPerRoot: 50,
      repoRoots: [],
    })

    expect(result.claudeFiles).toEqual([join(projectsDir, 'real.jsonl')])
  })

  // Repo-scoping coverage (Claude + Codex regression locks, and selectInRepo's own
  // rejection branch) lives in discover-files-repo-scope.test.mts — split out to stay
  // under this file's 300-line cap.

  // #8204 — sessionId narrows both roots to a single session's transcript(s) instead of
  // scanning everything under each root. An explicit session id bypasses repo scoping
  // entirely (see DiscoverOptions.sessionId) — it's already an exact target.
  describe('sessionId filtering', () => {
    it('narrows Claude discovery to the matching session file, excluding other sessions', async () => {
      root = mkdtempSync(join(tmpdir(), 'sandbox-audit-discover-'))
      const projectsDir = join(root, 'claude-projects')
      const codexSessionsDir = join(root, 'codex-sessions')
      mkdirSync(join(projectsDir, 'proj-a'), { recursive: true })
      mkdirSync(codexSessionsDir, { recursive: true })

      makeFile(join(projectsDir, 'proj-a', 'target-session.jsonl'), new Date('2026-01-01'))
      makeFile(join(projectsDir, 'proj-a', 'other-session.jsonl'), new Date('2026-01-02'))

      const result = await discoverTranscriptFiles({
        projectsDir,
        codexSessionsDir,
        maxFilesPerRoot: 50,
        sessionId: 'target-session',
        repoRoots: [],
      })

      expect(result.claudeFiles).toEqual([join(projectsDir, 'proj-a', 'target-session.jsonl')])
    })

    it('retains a matching session id nested subagent transcripts, not just the top-level file', async () => {
      root = mkdtempSync(join(tmpdir(), 'sandbox-audit-discover-'))
      const projectsDir = join(root, 'claude-projects')
      const codexSessionsDir = join(root, 'codex-sessions')
      const subagentsDir = join(projectsDir, 'proj-a', 'target-session', 'subagents')
      mkdirSync(subagentsDir, { recursive: true })
      mkdirSync(codexSessionsDir, { recursive: true })

      makeFile(join(projectsDir, 'proj-a', 'target-session.jsonl'), new Date('2026-01-01'))
      makeFile(join(subagentsDir, 'agent-1.jsonl'), new Date('2026-01-02'))
      makeFile(join(projectsDir, 'proj-a', 'other-session.jsonl'), new Date('2026-01-03'))

      const result = await discoverTranscriptFiles({
        projectsDir,
        codexSessionsDir,
        maxFilesPerRoot: 50,
        sessionId: 'target-session',
        repoRoots: [],
      })

      expect(result.claudeFiles).toHaveLength(2)
      expect(result.claudeFiles.some(path => path.endsWith('target-session.jsonl'))).toBe(true)
      expect(result.claudeFiles.some(path => path.endsWith('agent-1.jsonl'))).toBe(true)
      expect(result.claudeFiles.some(path => path.endsWith('other-session.jsonl'))).toBe(false)
    })

    it('narrows Codex discovery to the matching rollout file, excluding other sessions', async () => {
      root = mkdtempSync(join(tmpdir(), 'sandbox-audit-discover-'))
      const projectsDir = join(root, 'claude-projects')
      const codexSessionsDir = join(root, 'codex-sessions', '2026', '01', '01')
      mkdirSync(projectsDir, { recursive: true })
      mkdirSync(codexSessionsDir, { recursive: true })

      makeFile(
        join(codexSessionsDir, 'rollout-2026-01-01T00-00-00-target-session.jsonl'),
        new Date('2026-01-01'),
      )
      makeFile(
        join(codexSessionsDir, 'rollout-2026-01-01T00-00-00-other-session.jsonl'),
        new Date('2026-01-02'),
      )

      const result = await discoverTranscriptFiles({
        projectsDir,
        codexSessionsDir: join(root, 'codex-sessions'),
        maxFilesPerRoot: 50,
        sessionId: 'target-session',
        repoRoots: [],
      })

      expect(result.codexFiles).toEqual([
        join(codexSessionsDir, 'rollout-2026-01-01T00-00-00-target-session.jsonl'),
      ])
    })
  })
})
