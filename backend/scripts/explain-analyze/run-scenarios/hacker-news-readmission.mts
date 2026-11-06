import assert from 'node:assert/strict'
import { read } from '@data-stores/psql'
import {
  buildHackerNewsReadmissionPageQuery,
  prepareHackerNewsLookupReadmissionWindow,
} from '@services/urls/hacker-news-lookup-readmission'
import { getHackerNewsWorkLimit } from '@services/urls/hacker-news-work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { resolveSeedAnchor } from '../seed-data/seed-anchor.mts'
import {
  seedHackerNewsReadmissionFixture,
  cleanupHackerNewsReadmissionFixture,
} from '../seed-data/hacker-news-readmission.mts'

/** Capture the actual production selector without admitting external lookup jobs. */
export async function runHackerNewsReadmissionScenarios(): Promise<void> {
  const { dayAnchorMs } = resolveSeedAnchor(process.env.EXPLAIN_SEED_ANCHOR_DATE)
  const window = await prepareHackerNewsLookupReadmissionWindow(undefined, dayAnchorMs)
  assert(window, 'Readmission plans require enabled lookup admission')
  const size = getHackerNewsWorkLimit('lookup_batch_size')
  try {
    const fixture = await seedHackerNewsReadmissionFixture(window, size * 50)
    assert(
      Number(fixture.density.candidates) < Number(fixture.density.total) / 2,
      'The complete totals corpus must be mostly newer than the due ceiling',
    )
    console.log(
      `Readmission plan corpus: ${fixture.density.total} totals, ${fixture.density.candidates} candidates`,
    )
    const pages = [
      { suffix: 'first', after: undefined, expected: size },
      { suffix: 'later', after: fixture.middle, expected: Math.min(size, fixture.remaining) },
      { suffix: 'exhausted', after: fixture.last, expected: 0 },
    ]
    for (const page of pages) {
      const id = `hacker-news-readmission-mostly-fresh-${page.suffix}`
      registerScenarioContract(id, {
        seededRows: { url_hacker_news_totals: Number(fixture.density.total) },
        forbidSequentialScans: ['url_hacker_news_totals'],
        expectations: [
          {
            kind: 'usesIndexes',
            indexes: ['idx_url_hacker_news_totals__looked_up_at__url_id'],
            noSort: true,
          },
          { kind: 'queryBinds', token: 'looked_up_at' },
          { kind: 'maxProcessedRows', relation: 'url_hacker_news_totals', max: size },
        ],
        allowEmptyResult: page.expected === 0,
      })
      // no-mistakes-disable-next-line query-reached-per-item: first, populated and exhausted composite pages each capture the same bounded production selector.
      await runAndCapture(
        id,
        async () => {
          const { rows } = await read(buildHackerNewsReadmissionPageQuery(window, page.after))
          assert.equal(rows.length, page.expected)
        },
        undefined,
        'readmitHackerNewsLookupPage',
      )
    }
  } finally {
    await cleanupHackerNewsReadmissionFixture()
  }
}
