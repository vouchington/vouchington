import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { runJscpd } from '../run-jscpd.mts'
import {
  SYNTHETIC_MERGE_BASE,
  createFakeRun,
  scanCall,
  type FakeRun,
} from '../test-helpers/jscpd-fake-repo.mts'

function mergeBaseArgs(run: FakeRun): string[] | undefined {
  return run.calls.find(call => call.args[0] === 'merge-base')?.args
}

describe('runJscpd base resolution', () => {
  it('uses the --base ref', () => {
    using run = createFakeRun({}, { GITHUB_BASE_REF: 'ignored-parent' })
    expect(runJscpd(['--base', 'feature/parent'], run.context)).toBe(0)
    expect(mergeBaseArgs(run)).toEqual(['merge-base', 'feature/parent', 'HEAD'])
  })

  it('uses origin/$GITHUB_BASE_REF so stacked pull requests compare against their parent', () => {
    using run = createFakeRun({}, { GITHUB_BASE_REF: 'feature/parent' })
    expect(runJscpd([], run.context)).toBe(0)
    expect(mergeBaseArgs(run)).toEqual(['merge-base', 'origin/feature/parent', 'HEAD'])
  })

  it('defaults to origin/main', () => {
    using run = createFakeRun({})
    expect(runJscpd([], run.context)).toBe(0)
    expect(mergeBaseArgs(run)).toEqual(['merge-base', 'origin/main', 'HEAD'])
  })

  it('explains how to fetch the base or pass --base when merge-base fails', () => {
    using run = createFakeRun({
      mergeBase: { status: 128, stdout: '', stderr: 'fatal: Not a valid object name origin/main' },
    })
    expect(() => runJscpd([], run.context)).toThrow(
      /Not a valid object name origin\/main[\s\S]*fetch-base-ref[\s\S]*git fetch origin main[\s\S]*--base <parent-branch>/,
    )
    expect(scanCall(run)).toBeUndefined()
  })

  it('rejects unknown arguments', () => {
    using run = createFakeRun({})
    for (const args of [['--bse', 'main'], ['--base'], ['--base', '--silent'], ['extra']]) {
      expect(() => runJscpd(args, run.context)).toThrow('Unknown jscpd arguments')
    }
    expect(run.calls).toEqual([])
  })
})

describe('runJscpd scan invocation', () => {
  it('rescans the merge-base without a shell and removes the report directory', () => {
    using run = createFakeRun({ ignore: [], tracked: ['src/app.ts'] })
    expect(runJscpd([], run.context)).toBe(0)
    const args = scanCall(run)?.args ?? []
    const outputDir = args.at(-1) ?? ''
    expect(args).toEqual([
      'exec',
      'jscpd',
      '.',
      '--baseline-from-ref',
      SYNTHETIC_MERGE_BASE,
      '--reporters',
      'json',
      '--silent',
      '--output',
      outputDir,
    ])
    expect(existsSync(outputDir)).toBe(false)
  })

  it('passes config globs and escaped, root-anchored untracked paths as one --ignore', () => {
    using run = createFakeRun({
      ignore: ['**/fixtures/**'],
      untracked: ['notes/scratch.ts', 'web/app/[id]/draft{1}.ts', 'nested-worktree/'],
    })
    expect(runJscpd([], run.context)).toBe(0)
    const args = scanCall(run)?.args ?? []
    expect(args.filter(arg => arg === '--ignore')).toHaveLength(1)
    expect(args[args.indexOf('--ignore') + 1]).toBe(
      '**/fixtures/**,./notes/scratch.ts,./web/app/\\[id\\]/draft\\{1\\}.ts,./nested-worktree/**',
    )
  })

  it('rejects an untracked path containing a comma before scanning', () => {
    using run = createFakeRun({ untracked: ['notes/a,b.ts'] })
    expect(() => runJscpd([], run.context)).toThrow(
      /comma-separated[\s\S]*\.\/notes\/a,b\.ts[\s\S]*Rename the untracked path/,
    )
    expect(scanCall(run)).toBeUndefined()
  })

  it('propagates a jscpd failure as a tool error instead of a clone report', () => {
    using run = createFakeRun({
      scan: { status: 2, stdout: 'Using config: .jscpd.json', stderr: 'error: bad glob' },
    })
    expect(runJscpd([], run.context)).toBe(2)
    expect(run.errors).toEqual([
      'Using config: .jscpd.json',
      'error: bad glob',
      'jscpd failed with exit 2.',
    ])
    expect(run.logs).toEqual([])
  })

  it('treats a signal-terminated jscpd as a failure', () => {
    using run = createFakeRun({ scan: { status: null, stdout: '', stderr: '' } })
    expect(runJscpd([], run.context)).toBe(1)
    expect(run.errors).toEqual(['jscpd failed with a signal.'])
  })
})

describe('runJscpd clone results', () => {
  it('prints only new exact and similar clones with their ranges and fails', () => {
    using run = createFakeRun({
      clones: [
        { isNew: true, first: 'src/a.ts:3-14', second: 'src/b.ts:20-31' },
        { isNew: false, first: 'src/old.ts:1-9', second: 'src/older.ts:1-9' },
        { isNew: true, kind: 'similar', first: 'src/c.tsx:5-16', second: 'src/d.tsx:7-18' },
      ],
    })
    expect(runJscpd([], run.context)).toBe(1)
    expect(run.errors.slice(0, 3)).toEqual([
      `jscpd: 2 new clone(s) against merge-base ${SYNTHETIC_MERGE_BASE.slice(0, 12)} (origin/main):`,
      '  exact src/a.ts:3-14 ~ src/b.ts:20-31 (12 lines)',
      '  similar src/c.tsx:5-16 ~ src/d.tsx:7-18 (12 lines)',
    ])
    expect(run.errors.join('\n')).not.toContain('src/old.ts')
    expect(run.errors.slice(3).join(' ')).toMatch(/extract the shared code[\s\S]*exceptions table/)
    expect(run.logs).toEqual([])
  })

  it('passes with a summary when every clone already exists at the merge-base', () => {
    using run = createFakeRun({
      clones: [{ isNew: false, first: 'src/old.ts:1-9', second: 'src/older.ts:1-9' }],
    })
    expect(runJscpd([], run.context)).toBe(0)
    expect(run.logs).toEqual([
      `jscpd: no new clones against merge-base ${SYNTHETIC_MERGE_BASE.slice(0, 12)} (origin/main); 3 files scanned, 1 existing clones.`,
    ])
    expect(run.errors).toEqual([])
  })
})

describe('runJscpd configuration guards', () => {
  it('fails on inline ignore markers, naming each file and line, before scanning', () => {
    using run = createFakeRun({
      markerHits: [
        { file: 'src/app.ts', line: 12 },
        { file: 'db/seed.sql', line: 3 },
      ],
    })
    expect(runJscpd([], run.context)).toBe(1)
    expect(run.errors).toHaveLength(2)
    expect(run.errors[0]).toMatch(/^src\/app\.ts:12: inline jscpd ignore markers are banned/)
    expect(run.errors[1]).toMatch(/^db\/seed\.sql:3: /)
    expect(mergeBaseArgs(run)).toBeUndefined()
    expect(scanCall(run)).toBeUndefined()
  })

  it('fails on an ignore glob that matches no tracked file', () => {
    using run = createFakeRun({ ignore: ['**/fixtures/**', '**/removed/**'] })
    expect(runJscpd([], run.context)).toBe(1)
    expect(run.errors).toEqual([
      '.jscpd.json ignore glob "**/removed/**" matches no tracked file; delete it and its README row.',
    ])
    expect(scanCall(run)).toBeUndefined()
  })

  it('fails on an ignore glob that jscpd would match at any depth', () => {
    using run = createFakeRun({ ignore: ['test/fixtures/**'] })
    expect(runJscpd([], run.context)).toBe(1)
    expect(run.errors).toEqual([
      '.jscpd.json ignore glob "test/fixtures/**" must start with "**/"; jscpd matches bare globs at any depth.',
    ])
  })

  it('reports every configuration problem in one run', () => {
    using run = createFakeRun({
      ignore: ['fixtures/**', '**/removed/**'],
      markerHits: [{ file: 'src/app.ts', line: 1 }],
    })
    expect(runJscpd([], run.context)).toBe(1)
    expect(run.errors).toHaveLength(3)
  })
})
