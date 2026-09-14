import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { pair2BaseRef, resolvePair2Revisions } from './pr-revision-pairs.mts'

const FULL_SHA = /^[0-9a-f]{40}$/iu

describe('PR revision pairs', () => {
  it('names pair 2 as origin/<base branch> vs HEAD', () => {
    expect(pair2BaseRef('main')).toBe('origin/main')
    expect(pair2BaseRef('release/2026-07')).toBe('origin/release/2026-07')
  })

  it('resolves pair 2 to the worktree HEAD and origin/<base> commits', () => {
    const head = execFileSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], {
      encoding: 'utf8',
    }).trim()
    const base = execFileSync('git', ['rev-parse', '--verify', 'origin/main^{commit}'], {
      encoding: 'utf8',
    }).trim()
    expect(resolvePair2Revisions(process.cwd(), 'main')).toEqual({ base, head })
    expect(base).toMatch(FULL_SHA)
    expect(head).toMatch(FULL_SHA)
  })

  it('rejects a worktree that cannot resolve origin/<base>', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pr-revision-pairs-'))
    try {
      writeFileSync(join(dir, 'README'), '')
      expect(() => resolvePair2Revisions(dir, 'main')).toThrow(
        /git rev-parse --verify origin\/main\^\{commit\} failed/u,
      )
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })
})
