import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { discoverTranscriptFiles, selectInRepo } from '../discover-files.mts'

// Repo-scoping coverage for discover-files.mts, split out from discover-files.test.mts
// (which covers glob/cap/sinceDays/sessionId mechanics) to stay under the 300-line cap.

function makeFile(path: string, mtime: Date): void {
  writeFileSync(path, '{}\n')
  utimesSync(path, mtime, mtime)
}

function makeCwdFile(path: string, mtime: Date, cwd: string): void {
  writeFileSync(path, `${JSON.stringify({ cwd })}\n`)
  utimesSync(path, mtime, mtime)
}

describe('discoverTranscriptFiles repo scoping', () => {
  let root: string

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  // #9406 — repo-scope regression lock: applying maxFilesPerRoot before the repo
  // filter would let other-repo files starve the cap. Three other-repo files are
  // newer than the two real in-repo files; a naive cap-then-filter would return zero
  // in-repo files here.
  it('applies repo scoping before the per-root cap, never after (Claude)', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-discover-scope-'))
    const projectsDir = join(root, 'claude-projects')
    const codexSessionsDir = join(root, 'codex-sessions')
    mkdirSync(projectsDir, { recursive: true })
    mkdirSync(codexSessionsDir, { recursive: true })
    const inRepoRoot = join(root, 'in-repo')
    const otherRepoRoot = join(root, 'other-repo')

    const inRepoFileA = join(projectsDir, 'in-repo-1', 'session-a.jsonl')
    const inRepoFileB = join(projectsDir, 'in-repo-2', 'session-b.jsonl')
    mkdirSync(join(projectsDir, 'in-repo-1'), { recursive: true })
    mkdirSync(join(projectsDir, 'in-repo-2'), { recursive: true })
    makeCwdFile(inRepoFileA, new Date('2026-01-01'), inRepoRoot)
    makeCwdFile(inRepoFileB, new Date('2026-01-02'), inRepoRoot)

    for (const [index, mtime] of [
      ['other-1', '2026-01-03'],
      ['other-2', '2026-01-04'],
      ['other-3', '2026-01-05'],
    ] as const) {
      const dir = join(projectsDir, index)
      mkdirSync(dir, { recursive: true })
      makeCwdFile(join(dir, 'session.jsonl'), new Date(mtime), otherRepoRoot)
    }

    const result = await discoverTranscriptFiles({
      projectsDir,
      codexSessionsDir,
      maxFilesPerRoot: 2,
      repoRoots: [inRepoRoot],
    })

    expect([...result.claudeFiles].sort()).toEqual([inRepoFileA, inRepoFileB].sort())
    expect(result.skippedOtherRepo.claude).toBe(3)
    expect(result.skippedUnknownCwd.claude).toBe(0)
  })

  // Same regression as above, but for Codex — discoverForRoot applies repo scoping
  // identically to both roots, but only the Claude side had a scoped-discovery test
  // until now.
  it('applies repo scoping before the per-root cap, never after (Codex)', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-discover-scope-'))
    const projectsDir = join(root, 'claude-projects')
    const codexSessionsDir = join(root, 'codex-sessions')
    mkdirSync(projectsDir, { recursive: true })
    mkdirSync(codexSessionsDir, { recursive: true })
    const inRepoRoot = join(root, 'in-repo')
    const otherRepoRoot = join(root, 'other-repo')

    const inRepoFile = join(codexSessionsDir, 'rollout-in-repo.jsonl')
    makeCwdFile(inRepoFile, new Date('2026-01-01'), inRepoRoot)
    makeCwdFile(
      join(codexSessionsDir, 'rollout-other.jsonl'),
      new Date('2026-01-02'),
      otherRepoRoot,
    )
    makeFile(join(codexSessionsDir, 'rollout-unknown.jsonl'), new Date('2026-01-03'))

    const result = await discoverTranscriptFiles({
      projectsDir,
      codexSessionsDir,
      maxFilesPerRoot: 50,
      repoRoots: [inRepoRoot],
    })

    expect(result.codexFiles).toEqual([inRepoFile])
    expect(result.skippedOtherRepo.codex).toBe(1)
    expect(result.skippedUnknownCwd.codex).toBe(1)
  })
})

describe('selectInRepo', () => {
  it('excludes an entry whose cwd resolver rejects, counting it as skippedUnknownCwd', async () => {
    const entries = [{ path: '/repo/a.jsonl', mtimeMs: 1 }]
    const throwingResolve = async (): Promise<string | undefined> => {
      throw new Error('EACCES: permission denied')
    }

    const result = await selectInRepo(entries, 50, ['/repo'], throwingResolve)

    expect(result.files).toEqual([])
    expect(result.skippedUnknownCwd).toBe(1)
    expect(result.skippedOtherRepo).toBe(0)
  })
})
