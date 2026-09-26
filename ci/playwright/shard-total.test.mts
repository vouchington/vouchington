import { spawnSync } from 'node:child_process'
import { globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  isRunnablePlaywrightSpec,
  playwrightShardTotal,
  runnablePlaywrightSpecCount,
  shardMatrix,
} from './shard-total.mts'

describe('isRunnablePlaywrightSpec', () => {
  it.each([
    ['playwright/tests/login.spec.mts', true],
    ['playwright/tests/nested/flow.spec.mts', true],
    ['playwright/tests/helpers.mts', false],
    ['playwright/fixtures/login.spec.mts', false],
    ['web/app/page.spec.mts', false],
  ])('classifies %s as runnable=%s', (file, runnable) => {
    expect(isRunnablePlaywrightSpec(file)).toBe(runnable)
  })
})

describe('playwrightShardTotal', () => {
  it('uses one shard for zero through 57 runnable spec files', () => {
    expect(playwrightShardTotal(0)).toBe(1)
    expect(playwrightShardTotal(1)).toBe(1)
    expect(playwrightShardTotal(57)).toBe(1)
  })

  it('adds a shard as the spec count crosses each execution-budget boundary', () => {
    expect(playwrightShardTotal(58)).toBe(2)
    expect(playwrightShardTotal(114)).toBe(2)
    expect(playwrightShardTotal(115)).toBe(3)
    expect(playwrightShardTotal(172)).toBe(3)
    expect(playwrightShardTotal(173)).toBe(4)
  })

  it('uses a valid explicit override instead of the runtime heuristic', () => {
    expect(playwrightShardTotal(30_721, '4')).toBe(4)
    expect(playwrightShardTotal(1, '256')).toBe(256)
    expect(playwrightShardTotal(58, '')).toBe(2)
  })

  it.each(['0', '-1', '1.5', ' 4 ', '257', 'not-a-number'])(
    'rejects invalid override %s',
    override => {
      expect(() => playwrightShardTotal(1, override)).toThrow(/Playwright shard-total override/)
    },
  )

  it.each([-1, 1.5, Number.NaN])('rejects invalid runnable spec count %s', specFileCount => {
    expect(() => playwrightShardTotal(specFileCount)).toThrow(
      /runnable Playwright spec count must be a non-negative integer/,
    )
  })

  it('rejects a computed shard total above the GitHub matrix limit', () => {
    expect(() => playwrightShardTotal(30_721)).toThrow(
      /computed Playwright shard total must not exceed 256/,
    )
  })
})

describe('runnablePlaywrightSpecCount', () => {
  it('counts the repository suite through the runnable Playwright spec predicate', () => {
    const candidates = globSync('playwright/tests/**/*', { cwd: process.cwd() })

    expect(runnablePlaywrightSpecCount(process.cwd())).toBe(
      candidates.filter(isRunnablePlaywrightSpec).length,
    )
    expect(runnablePlaywrightSpecCount(process.cwd())).toBeGreaterThan(0)
  })
})

describe('shard-total CLI', () => {
  it('writes the override shard total to GITHUB_OUTPUT', () => {
    const directory = mkdtempSync(join(tmpdir(), 'playwright-shard-total-'))
    const outputPath = join(directory, 'github-output')
    writeFileSync(outputPath, '')
    const result = spawnSync(process.execPath, ['ci/playwright/shard-total.mts'], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: outputPath, SHARD_TOTAL_OVERRIDE: '3' },
    })
    const output = readFileSync(outputPath, 'utf8')
    rmSync(directory, { force: true, recursive: true })

    expect(result.status).toBe(0)
    expect(output).toBe('shard-total=3\nshard-matrix=[1,2,3]\n')
  })

  it('fails without writing outputs for an invalid override', () => {
    const directory = mkdtempSync(join(tmpdir(), 'playwright-shard-total-'))
    const outputPath = join(directory, 'github-output')
    writeFileSync(outputPath, '')
    const result = spawnSync(process.execPath, ['ci/playwright/shard-total.mts'], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: outputPath, SHARD_TOTAL_OVERRIDE: '257' },
    })
    const output = readFileSync(outputPath, 'utf8')
    rmSync(directory, { force: true, recursive: true })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Playwright shard-total override must not exceed 256')
    expect(output).toBe('')
  })
})

describe('shardMatrix', () => {
  it('lists every one-based shard index', () => {
    expect(shardMatrix(1)).toEqual([1])
    expect(shardMatrix(4)).toEqual([1, 2, 3, 4])
  })
})
