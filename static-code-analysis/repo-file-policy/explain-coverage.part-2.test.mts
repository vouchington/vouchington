import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isRead, reportCoverage } from '../explain-coverage.mts'

describe('EXPLAIN coverage locking reads', () => {
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
    expect(isRead('/* update */ WITH sql_placeholder_1 SELECT id FROM changed')).toBe(false)
    expect(
      isRead('WITH rows AS (SELECT id FROM jobs WHERE sql_placeholder_1) SELECT id FROM rows'),
    ).toBe(false)
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
