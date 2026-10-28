import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { countJobSuiteFiles } from './job-suite-count.mts'

describe('countJobSuiteFiles', () => {
  it('counts backend and web fixture projects with their roots and excludes', () => {
    const root = mkdtempSync(join(tmpdir(), 'vitest-project-count-'))
    try {
      for (const file of [
        'backend/present.test.mts',
        'backend/other.test.mts',
        'backend/excluded.test.mts',
        'web/widget.test.tsx',
      ]) {
        const path = join(root, file)
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, '')
      }
      const counts = countJobSuiteFiles(root, [
        {
          root: 'backend',
          test: {
            name: 'backend-data-stores',
            include: ['*.test.mts'],
            exclude: ['excluded.test.mts'],
          },
        },
        { test: { root: 'web', name: 'web', include: ['*.test.tsx'] } },
        { test: { name: 'unmapped-fixture', include: ['missing.test.mts'] } },
      ])

      expect(Object.fromEntries(counts)).toEqual({ 'test-backend-unit': 2, 'test-web': 1 })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects an empty owned project even when another project fills its job', () => {
    const root = mkdtempSync(join(tmpdir(), 'vitest-project-count-'))
    try {
      writeFileSync(join(root, 'present.test.mts'), '')
      expect(() =>
        countJobSuiteFiles(root, [
          { test: { name: 'backend-data-stores', include: ['present.test.mts'] } },
          { test: { name: 'backend-real-glide-mq', include: ['missing.test.mts'] } },
        ]),
      ).toThrow(
        'Vitest project backend-real-glide-mq owned by test-backend-unit selects no test files',
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('counts overlapping owned project files once in their job union', () => {
    const root = mkdtempSync(join(tmpdir(), 'vitest-project-count-'))
    try {
      writeFileSync(join(root, 'shared.test.mts'), '')
      writeFileSync(join(root, 'other.test.mts'), '')
      const counts = countJobSuiteFiles(root, [
        { test: { name: 'backend-data-stores', include: ['*.test.mts'] } },
        { test: { name: 'backend-real-glide-mq', include: ['shared.test.mts'] } },
      ])
      expect(counts.get('test-backend-unit')).toBe(2)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
