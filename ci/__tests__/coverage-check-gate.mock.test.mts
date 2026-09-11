import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

vi.mock<typeof import('coverage-check')>(import('coverage-check'), async importOriginal => {
  const actual = await importOriginal<typeof import('coverage-check')>()
  return {
    ...actual,
    runCheck: vi.fn<typeof actual.runCheck>(async () => 0),
    evaluateCheck: vi.fn<typeof actual.evaluateCheck>(),
  }
})

let coverageCheck: typeof import('coverage-check')
let runMergeAndCheck: typeof import('../coverage-check-gate.mts').runMergeAndCheck
let evaluateMergeAndCheck: typeof import('../coverage-check-gate.mts').evaluateMergeAndCheck
let zeroThresholdGlobs: typeof import('../coverage-check-gate.mts').zeroThresholdGlobs

const stubEvaluatedCheck: Awaited<ReturnType<typeof import('coverage-check').evaluateCheck>> = {
  exitCode: 0,
  result: null,
  suiteSources: [],
  runUrl: '',
  branch: '',
  diffContent: null,
  parsedSources: [],
  warnings: [],
}

async function loadWithMocks(): Promise<void> {
  vi.resetModules()
  coverageCheck = await import('coverage-check')
  ;({ runMergeAndCheck, evaluateMergeAndCheck, zeroThresholdGlobs } =
    await import('../coverage-check-gate.mts'))
  vi.mocked(coverageCheck.runCheck).mockReset()
  vi.mocked(coverageCheck.runCheck).mockResolvedValue(0)
  vi.mocked(coverageCheck.evaluateCheck).mockReset()
  vi.mocked(coverageCheck.evaluateCheck).mockResolvedValue(stubEvaluatedCheck)
}

describe('runMergeAndCheck', () => {
  it('runs coverage-check through the public aggregate API', async () => {
    await loadWithMocks()

    const exit = await runMergeAndCheck({
      artifactsDir: 'coverage-full',
      base: 'origin/main',
      head: 'HEAD',
    })

    expect(exit).toBe(0)
    expect(coverageCheck.runCheck).toHaveBeenCalledWith({
      rules: '.coverage-rules.yml',
      artifacts: 'coverage-full',
      base: 'origin/main',
      head: 'HEAD',
      pr: null,
      repo: process.env.GITHUB_REPOSITORY ?? '',
      json: null,
      stripPrefixes: [],
      store: null,
      suite: null,
      annotateSource: true,
      aggregateArtifacts: true,
      failOnEmpty: true,
      ignorePaths: [],
      advisory: false,
    })
  })

  it('forwards advisory: true through to coverage-check', async () => {
    await loadWithMocks()

    await runMergeAndCheck({
      artifactsDir: 'coverage-full',
      base: 'origin/main',
      head: 'HEAD',
      advisory: true,
    })

    expect(coverageCheck.runCheck).toHaveBeenCalledWith(expect.objectContaining({ advisory: true }))
  })

  it('passes an empty repo when the GitHub repository env var is unset', async () => {
    await loadWithMocks()
    const previousRepository = process.env.GITHUB_REPOSITORY
    delete process.env.GITHUB_REPOSITORY
    try {
      await runMergeAndCheck({
        artifactsDir: 'coverage-full',
        base: 'origin/main',
        head: 'HEAD',
      })
    } finally {
      if (previousRepository === undefined) {
        delete process.env.GITHUB_REPOSITORY
      } else {
        process.env.GITHUB_REPOSITORY = previousRepository
      }
    }

    expect(coverageCheck.runCheck).toHaveBeenCalledWith(expect.objectContaining({ repo: '' }))
  })

  it('passes json and ignore-path options to coverage-check', async () => {
    await loadWithMocks()

    await runMergeAndCheck({
      artifactsDir: 'coverage-affected',
      base: 'origin/main',
      head: 'HEAD',
      jsonPath: 'coverage-report.json',
      excludePathGlobs: ['uncovered/**'],
    })

    expect(coverageCheck.runCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        artifacts: 'coverage-affected',
        json: 'coverage-report.json',
        ignorePaths: ['uncovered/**'],
      }),
    )
  })

  it('propagates non-zero status from coverage-check', async () => {
    await loadWithMocks()
    vi.mocked(coverageCheck.runCheck).mockResolvedValue(2)

    const exit = await runMergeAndCheck({
      artifactsDir: 'coverage-full',
      base: 'origin/main',
      head: 'HEAD',
    })

    expect(exit).toBe(2)
  })

  it('propagates coverage-check runtime errors', async () => {
    await loadWithMocks()
    vi.mocked(coverageCheck.runCheck).mockRejectedValue(new Error('git diff failed'))

    await expect(
      runMergeAndCheck({ artifactsDir: 'coverage-full', base: 'origin/main', head: 'HEAD' }),
    ).rejects.toThrow('git diff failed')
  })
})

describe('evaluateMergeAndCheck', () => {
  it('evaluates coverage-check through the public aggregate API and returns the raw result', async () => {
    await loadWithMocks()

    const evaluated = await evaluateMergeAndCheck({
      artifactsDir: 'coverage-changed',
      base: 'origin/main',
      head: 'WORKTREE',
    })

    expect(evaluated).toBe(stubEvaluatedCheck)
    expect(coverageCheck.evaluateCheck).toHaveBeenCalledWith({
      rules: '.coverage-rules.yml',
      artifacts: 'coverage-changed',
      base: 'origin/main',
      head: 'WORKTREE',
      pr: null,
      repo: process.env.GITHUB_REPOSITORY ?? '',
      json: null,
      stripPrefixes: [],
      store: null,
      suite: null,
      annotateSource: true,
      aggregateArtifacts: true,
      failOnEmpty: true,
      ignorePaths: [],
      advisory: false,
    })
  })

  it('forwards advisory: true through to coverage-check without printing coverage-check’s own banner', async () => {
    await loadWithMocks()

    await evaluateMergeAndCheck({
      artifactsDir: 'coverage-changed',
      base: 'origin/main',
      head: 'WORKTREE',
      advisory: true,
    })

    expect(coverageCheck.evaluateCheck).toHaveBeenCalledWith(
      expect.objectContaining({ advisory: true }),
    )
    expect(coverageCheck.runCheck).not.toHaveBeenCalled()
  })

  it('propagates coverage-check runtime errors', async () => {
    await loadWithMocks()
    vi.mocked(coverageCheck.evaluateCheck).mockRejectedValue(new Error('git diff failed'))

    await expect(
      evaluateMergeAndCheck({
        artifactsDir: 'coverage-changed',
        base: 'origin/main',
        head: 'WORKTREE',
      }),
    ).rejects.toThrow('git diff failed')
  })
})

describe('zeroThresholdGlobs', () => {
  it('falls back to an empty list when rules parsing fails', async () => {
    await loadWithMocks()
    const dir = await mkdtemp(join(tmpdir(), 'voucha-coverage-rules-'))
    const rulesPath = join(dir, '.coverage-rules.yml')
    await writeFile(rulesPath, 'rules:\n  - paths: [not-a-string]\n')

    expect(zeroThresholdGlobs(rulesPath)).toEqual([])
  })
})
