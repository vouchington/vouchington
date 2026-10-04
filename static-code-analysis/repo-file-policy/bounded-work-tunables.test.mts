import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkBoundedWorkTunables } from './bounded-work-tunables.mts'
import { setupRepoFilePolicyTest } from '../test-helpers/repo-file-policy-fixtures.mts'
import type { WorkTunableAllowEntry } from './bounded-work-tunables-allowlist.mts'

function inspect(
  sources: Record<string, string>,
  allowlist: readonly WorkTunableAllowEntry[] = [],
  tracked = Object.keys(sources),
): string[] {
  const root = mkdtempSync(join(tmpdir(), 'bounded-work-policy-'))
  try {
    for (const [file, source] of Object.entries(sources)) {
      mkdirSync(dirname(join(root, file)), { recursive: true })
      writeFileSync(join(root, file), source)
    }
    return checkBoundedWorkTunables(root, tracked, allowlist)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const file = 'backend/workers/example/processor.mts'

describe('bounded work tunables policy', () => {
  const { makeRepo, run, track } = setupRepoFilePolicyTest()

  it('enforces the same scanner through the owning aggregate', async () => {
    const root = await makeRepo()
    await track(root, file, 'const config = { defaultFields: { batch_size: 100 } }')
    await expect(run(root)).resolves.toEqual({ stdout: 'All checks passed.' })
    await track(root, file, 'const BATCH_SIZE = 100')
    await expect(run(root)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('BATCH_SIZE must use an owning DynamicConfig'),
    })
  })
  it('finds exact numeric suffixes, typed and later sibling declarations, signs and wrappers', () => {
    const errors = inspect({
      [file]: [
        'const BATCH_SIZE = 1_000',
        'const other = 1, MAX_BATCHES = -2',
        'export const PAGE_SIZE: number = +(0x10) as const',
        'const CHUNK_SIZE = ((5)) as number',
        'const REQUESTS_PER_RUN = 1e3',
        'const FIRST = 1, SECOND_PAGE_SIZE = 0b10, THIRD_CHUNK_SIZE = 0o10',
      ].join('\n'),
    })
    expect(errors).toHaveLength(7)
    expect(errors.join('\n')).toContain('line=3::')
    expect(errors.join('\n')).toContain('PAGE_SIZE')
    expect(errors.join('\n')).toContain('THIRD_CHUNK_SIZE')
  })

  it('finds direct environment dot, quoted bracket and renamed or sibling destructuring', () => {
    const errors = inspect({
      [file]: [
        'const a = process.env.CRAWLER_BATCH_SIZE',
        "const b = process.env['DEFAULT_PAGE_SIZE']",
        'const c = process.env["PAGE_SIZE"]',
        'const { unrelated, BATCH_SIZE, PAGE_SIZE: size } = process.env',
        'let { DEFAULT_PAGE_SIZE: renamed } = process.env',
        'const { BATCH_SIZE = 100, PAGE_SIZE: alias = 20 } = process.env',
      ].join('\n'),
    })
    expect(errors).toHaveLength(8)
    expect(errors.join('\n')).toContain('DEFAULT_PAGE_SIZE')
    expect(errors.join('\n')).toContain('line=5::')
  })

  it('ignores defaults properties, comments, strings, other owners and nonnumeric constants', () => {
    expect(
      inspect({
        [file]: [
          'const config = new DynamicConfig({ defaultFields: { batch_size: 100 } })',
          'const DEFAULTS = { PAGE_SIZE: 100 }',
          'const PAGE_SIZE = config.getField("page_size")',
          'const BATCH_SIZE = 10n',
          'let CHUNK_SIZE = 100',
          'const unrelated = 100',
          'const a = "process.env.PAGE_SIZE"',
          '// const MAX_BATCHES = 100',
          'const { PAGE_SIZE } = other',
          'const b = process.env.IMAGE_ORIGIN',
          'const key = "PAGE_SIZE"; const c = process.env[key]',
          'const d = process.env[somePageSizeVariable]',
        ].join('\n'),
      }),
    ).toEqual([])
  })

  it('scans only tracked backend runtime files, including other backend owners', () => {
    const sources = {
      'backend/services/example/runtime.ts': 'const PAGE_SIZE = 100',
      'backend/services/example/runtime.test.mts': 'const PAGE_SIZE = 100',
      'backend/test-helpers/runtime.mts': 'const PAGE_SIZE = 100',
      'backend/scripts/runtime.mts': 'const PAGE_SIZE = 100',
      'backend/services/example/__tests__/fixture.mts': 'const PAGE_SIZE = 100',
      'backend/services/example/untracked.mts': 'const PAGE_SIZE = 100',
      'web/example.ts': 'const PAGE_SIZE = 100',
    }
    const errors = inspect(
      sources,
      [],
      Object.keys(sources).filter(path => !path.includes('untracked')),
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('backend/services/example/runtime.ts')
  })

  it('accepts only exact reasoned matches and rejects blank reasons, duplicates and stale values', () => {
    const entry = {
      file,
      ruleId: 'bounded-work-literal',
      identifier: 'BATCH_SIZE',
      value: '100',
      reason: 'External protocol ceiling',
    }
    expect(inspect({ [file]: 'const BATCH_SIZE = 100' }, [entry])).toEqual([])
    expect(inspect({ [file]: 'const BATCH_SIZE = 101' }, [entry])).toHaveLength(2)
    expect(inspect({ [file]: 'const BATCH_SIZE = 100' }, [{ ...entry, reason: ' ' }])).toHaveLength(
      2,
    )
    expect(inspect({ [file]: 'const BATCH_SIZE = 100' }, [entry, entry])).toHaveLength(1)
    expect(inspect({ [file]: 'const OTHER_BATCH_SIZE = 100' }, [entry])).toHaveLength(2)
    expect(inspect({}, [entry])).toHaveLength(1)
  })
})
