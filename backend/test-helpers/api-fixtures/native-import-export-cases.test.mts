import { describe, expect, it } from 'vitest'

import { apiFixtureCases } from './cases.mts'

const expectedConsumers = ['web', 'swift-core', 'swift-ui', 'dotnet-core']

describe('native import/export API fixture cases', () => {
  it('covers submission, retrying and partial RSS progress plus topic outcomes and export', () => {
    const fixtures = apiFixtureCases.filter(fixture =>
      fixture.id.startsWith('native.import-export.'),
    )

    expect(fixtures.map(fixture => fixture.id)).toEqual([
      'native.import-export.rss-feeds.submit.default',
      'native.import-export.rss-feeds.status.retrying',
      'native.import-export.rss-feeds.status.partial',
      'native.import-export.topics.import.outcomes',
      'native.import-export.topics.export.default',
      'native.import-export.topics.export.download',
    ])
    for (const fixture of fixtures) {
      expect(fixture.consumers).toEqual(expectedConsumers)
    }

    const submission = fixtures[0]!
    const retrying = fixtures[1]!
    const partial = fixtures[2]!
    const submittedUrls = (submission.requestBody as { urls: string[] }).urls
    expect(submittedUrls).toHaveLength(2)
    for (const lifecycle of [retrying, partial]) {
      const body = lifecycle.body as {
        import: { total_rows: number }
        rows: Array<{ input: string }>
      }
      expect(body.import.total_rows).toBe(submittedUrls.length)
      expect(body.rows.map(row => row.input)).toEqual(submittedUrls)
    }

    const topicImport = fixtures[3]!
    const topicNames = (topicImport.requestBody as { names: string[] }).names
    const topicResults = (
      topicImport.body as {
        results: Array<{ input: string; status: string; error?: string }>
      }
    ).results
    expect(topicResults.map(result => result.input)).toEqual(topicNames)
    expect(topicResults.at(-1)).toEqual({
      input: '!!!',
      status: 'error',
      error: 'Could not derive a valid slug from name',
    })

    expect(fixtures[4]!.body).toEqual({ results: fixtures[5]!.body })
    expect(fixtures[5]!.query).toEqual({ download: '1' })
  })
})
