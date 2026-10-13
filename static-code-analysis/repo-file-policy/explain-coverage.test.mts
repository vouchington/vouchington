import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatCoverageReport, isRead, reportCoverage } from '../explain-coverage.mts'
import { trackedRuntimeSources } from '../explain-coverage-files.mts'

describe('EXPLAIN coverage', () => {
  it('inventories typed optional, aliased, owned, and wrapper-callback reads', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'explain-coverage-community-'))
    try {
      const resultsPath = join(fixtureDir, 'results.json')
      writeFileSync(
        resultsPath,
        JSON.stringify({
          results: [{ name: 'other', query_text: '/* other */ SELECT 1', scenario_id: 'fixture' }],
          completedScenarioIds: ['fixture'],
        }),
      )
      const paths = [
        'backend/services/communities/members/batch.mts',
        'backend/services/communities/applications/pending.mts',
        'backend/services/classifier-runs/run-lock.mts',
        'backend/services/moderation-threads/escalate.mts',
        'backend/services/copyright-notices/claimant-misuse-summary.mts',
      ]
      const sources = paths.map(fileName => ({
        fileName,
        source: readFileSync(join(import.meta.dirname, '../..', fileName), 'utf8'),
      }))
      const report = await reportCoverage(sources, resultsPath, ['fixture'])
      expect(report).toMatchObject({ annotatedStatements: 13, reads: 9, coveredReads: 0 })
      expect(report.uncoveredReads.map(read => read.name)).toEqual([
        'getCommunityMemberBatch',
        'getPendingApplicationForUser',
        'getPendingApplicationCommunityIds',
        'readClassifierRunActor',
        'lockClassifierRunActor',
        'lockClassifierRun',
        'escalateModerationQueueItem:checkEscalated',
        'escalateModerationQueueItem:checkEscalated',
        'readClaimantMisuseSummaries',
      ])
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  it('discovers application SQL without replay-only EXPLAIN infrastructure', () => {
    const files = new Set(trackedRuntimeSources().map(source => source.fileName))
    expect(files.has('backend/services/oauth-accounts/connect.mts')).toBe(true)
    expect(files.has('backend/data-stores/psql/explain-analyze.mts')).toBe(false)
    expect(files.has('backend/data-stores/psql/explain-prepared.mts')).toBe(false)
  })

  it('does not count a dynamic read as covered by a same-named write', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'explain-coverage-reused-name-'))
    try {
      const resultsPath = join(fixtureDir, 'results.json')
      const source = `import { read, write } from '@data-stores/psql'
write('/* reused */ WITH changed AS (UPDATE things SET seen = true RETURNING id) SELECT id FROM changed')
read(\`/* reused */ SELECT id FROM things WHERE key = \${key}\`)
`
      writeFileSync(
        resultsPath,
        JSON.stringify({
          results: [
            {
              name: 'reused',
              query_text:
                '/* reused */ WITH changed AS (UPDATE things SET seen = true RETURNING id) SELECT id FROM changed',
              scenario_id: 'write-plan',
            },
          ],
          completedScenarioIds: ['write-plan'],
        }),
      )
      const report = await reportCoverage(
        [{ fileName: 'backend/services/things/query.mts', source }],
        resultsPath,
        ['write-plan'],
      )
      expect(report).toMatchObject({ annotatedStatements: 2, reads: 1, coveredReads: 0 })
      expect(report.ambiguousReads.map(read => read.name)).toEqual(['reused'])
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

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
        JSON.stringify({
          results: [
            {
              name: 'getPosts:force_custom_plan',
              query_text: '/* getPosts */ SELECT id FROM posts',
              scenario_id: 'posts-plan',
            },
            {
              name: 'getTopics:baseline:force_generic_plan',
              query_text:
                '/* getTopics */ WITH matching AS (SELECT id FROM topics) SELECT id FROM matching',
              scenario_id: 'topics-plan',
            },
          ],
          completedScenarioIds: ['posts-plan', 'topics-plan'],
        }),
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
        ['posts-plan', 'topics-plan'],
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
      expect(formatCoverageReport(report)).toContain('Ambiguous reads: 0\n\nworkers/accounts (1)')
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  it('separates same-named query shapes without changing SQL literal whitespace', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'explain-coverage-shapes-'))
    try {
      const resultsPath = join(fixtureDir, 'results.json')
      const source = `import { read } from '@data-stores/psql'
read("/* getPostByAny */ SELECT id FROM posts WHERE slug = 'a  b'")
read("/* getPostByAny */ SELECT id FROM posts WHERE slug = 'a b'")
read("/* getPostByAny */ SELECT id FROM posts WHERE slug = 'sql_placeholder_1'")
read(\`/* getPostByAny */ SELECT id FROM posts WHERE slug = \${slug}\`)
read("/* getUnique */ SELECT id FROM posts WHERE slug = 'a  b'")
`
      writeFileSync(
        resultsPath,
        JSON.stringify({
          results: [
            {
              name: 'getPostByAny:baseline:force_custom_plan',
              query_text: "/* getPostByAny */ SELECT id FROM posts WHERE slug = 'a  b'",
              scenario_id: 'post-plan',
            },
            {
              name: 'getUnique:force_generic_plan',
              query_text: "/* getUnique */ SELECT id FROM posts WHERE slug = 'a b'",
              scenario_id: 'unique-plan',
            },
          ],
          completedScenarioIds: ['post-plan', 'unique-plan'],
        }),
      )
      const report = await reportCoverage(
        [{ fileName: 'backend/services/posts/get.mts', source }],
        resultsPath,
        ['post-plan', 'unique-plan'],
      )
      expect(report).toMatchObject({ annotatedStatements: 5, reads: 5, coveredReads: 1 })
      expect(report.uncoveredReads.map(read => read.line)).toEqual([3, 4, 6])
      expect(report.ambiguousReads.map(read => read.line)).toEqual([5])
      expect(formatCoverageReport(report)).toContain('Ambiguous reads: 1')
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  it('excludes unknown leading verbs while counting root and subpath cursor reads', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'explain-coverage-cursors-'))
    try {
      const resultsPath = join(fixtureDir, 'results.json')
      writeFileSync(
        resultsPath,
        JSON.stringify({
          results: [
            {
              name: 'cursorRoot',
              query_text: '/* cursorRoot */ SELECT id FROM posts',
              scenario_id: 'cursor-plan',
            },
          ],
          completedScenarioIds: ['cursor-plan'],
        }),
      )
      const report = await reportCoverage(
        [
          {
            fileName: 'backend/services/posts/root.mts',
            source: `import { read, createAsyncGeneratorFromCursor } from '@data-stores/psql'
import sql from 'sql-template-strings'
read(\`/* dynamicLeading */ \${fragment}\`)
createAsyncGeneratorFromCursor(sql\`/* cursorRoot */ SELECT id FROM posts\`)
`,
          },
          {
            fileName: 'backend/services/posts/subpath.mts',
            source: `import { executeHandlerWithCursorInBatches } from '@data-stores/psql/cursors'
executeHandlerWithCursorInBatches(\`/* cursorSubpath */ SELECT id FROM posts\`, { batchSize: 1, handler: async () => {} })
`,
          },
        ],
        resultsPath,
        ['cursor-plan'],
      )
      expect(report).toMatchObject({ annotatedStatements: 3, reads: 2, coveredReads: 1 })
      expect(report.uncoveredReads.map(read => read.name)).toEqual(['cursorSubpath'])
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  it('counts locking CTE reads and rejects incomplete artifacts', async () => {
    expect(
      isRead(
        '/* assertTopicHasHostname */\n-- no-mistakes-disable-next-line postgres-required-predicates: exact lookup\n/* query */ SELECT id FROM topics',
      ),
    ).toBe(true)
    expect(
      isRead(
        '/* getTopics */ -- policy\r\nWITH topics AS (SELECT id FROM topics) SELECT id FROM topics',
      ),
    ).toBe(true)
    expect(isRead('/* update */ -- policy\nUPDATE topics SET active = true')).toBe(false)
    expect(isRead('/* unknown */ sql_placeholder_1 FROM topics')).toBe(false)
    expect(isRead('/* table */ TABLE topics')).toBe(true)
    expect(
      isRead('/* lock */ WITH rows AS (SELECT id FROM jobs FOR UPDATE) SELECT id FROM rows'),
    ).toBe(true)
    expect(
      isRead(
        '/* write */ WITH rows AS (UPDATE jobs SET done = true RETURNING id) SELECT id FROM rows',
      ),
    ).toBe(false)
    const fixtureDir = mkdtempSync(join(tmpdir(), 'explain-coverage-partial-'))
    try {
      const resultsPath = join(fixtureDir, 'results.json')
      writeFileSync(
        resultsPath,
        JSON.stringify({
          results: [{ name: 'lock', query_text: '/* lock */ SELECT 1', scenario_id: 'first' }],
          completedScenarioIds: ['first'],
        }),
      )
      await expect(reportCoverage([], resultsPath, ['first', 'later'])).rejects.toThrow(
        'Incomplete EXPLAIN scenario artifact',
      )
      writeFileSync(
        resultsPath,
        JSON.stringify({
          results: [
            { name: 'lock', query_text: '/* lock */ SELECT 1', scenario_id: 'first' },
            { name: 'late', query_text: '/* late */ SELECT 1', scenario_id: 'later' },
          ],
          completedScenarioIds: ['first'],
        }),
      )
      await expect(reportCoverage([], resultsPath, ['first', 'later'])).rejects.toThrow(
        'Incomplete EXPLAIN scenario artifact',
      )
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })
})
