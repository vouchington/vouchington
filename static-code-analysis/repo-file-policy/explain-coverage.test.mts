import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatCoverageReport, reportCoverage } from '../explain-coverage.mts'

describe('EXPLAIN coverage', () => {
  it('reports uncovered reads from two runtime sources and one EXPLAIN result', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'explain-coverage-'))
    try {
      const postSource = join(fixtureDir, 'posts.mts')
      const workerSource = join(fixtureDir, 'worker.mts')
      const resultsPath = join(fixtureDir, 'results.json')
      writeFileSync(
        postSource,
        `import { read, write } from '@data-stores/psql'
export async function getPosts() { return read('/* getPosts */ SELECT id FROM posts') }
export async function getTopics() { return read('/* getTopics */ WITH matching AS (SELECT id FROM topics) SELECT id FROM matching') }
export async function addPost() { return write('/* addPost */ WITH matching AS (SELECT id FROM posts) INSERT INTO posts SELECT id FROM matching') }
`,
      )
      writeFileSync(
        workerSource,
        `import { read } from '@data-stores/psql'
export async function getUsers() { return read('/* getUsers */ TABLE users') }
`,
      )
      writeFileSync(
        resultsPath,
        JSON.stringify([
          { name: 'getPosts:force_custom_plan' },
          { name: 'getTopics:force_generic_plan' },
        ]),
      )

      const report = await reportCoverage(
        [
          { fileName: 'backend/services/posts/read.mts', source: readFileSync(postSource, 'utf8') },
          {
            fileName: 'backend/workers/accounts/list.mts',
            source: readFileSync(workerSource, 'utf8'),
          },
        ],
        resultsPath,
      )

      expect(report).toMatchObject({ annotatedStatements: 4, reads: 3, coveredReads: 2 })
      expect(report.uncoveredReads).toEqual([
        {
          name: 'getUsers',
          fileName: 'backend/workers/accounts/list.mts',
          line: 2,
          group: 'workers/accounts',
        },
      ])
      expect(formatCoverageReport(report)).toContain('Uncovered reads: 1\n\nworkers/accounts (1)')
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })
})
