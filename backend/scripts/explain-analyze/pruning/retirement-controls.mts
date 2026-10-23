import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { write } from '@data-stores/psql/setup'
import { createMonthlyPartitionRetirementFixture } from './retirement-fixture.mts'

type Fixture = Awaited<ReturnType<typeof createMonthlyPartitionRetirementFixture>>

/** These are native FK/rollback controls, not SQL-text or fake-catalog assertions. */
export async function assertMonthlyRetirementControls(
  databaseName: string,
  record: (name: string) => void,
) {
  assert.match(databaseName, /^voucha_pruning_[a-f0-9]{24}$/)
  const { rows } = await write<{ name: string }>(
    '/* assertMonthlyRetirementDatabase */ SELECT current_database() AS name',
  )
  assert.equal(
    rows[0]?.name,
    databaseName,
    'Retirement controls require their owned sibling database',
  )
  await withFixture(async fixture => {
    assert.deepEqual(await fixture.retire(['crawl_chunks']), [])
    assert.partialDeepStrictEqual(await fixture.state(), {
      chunk_partition: false,
      chunk_exists: false,
      entity_exists: false,
      crawl_partition: true,
    })
  })
  record('deletes embedding batch entities before detaching an expired chunk partition')

  await withFixture(async fixture => {
    assert.deepEqual(await fixture.retire(['crawls']), [])
    assert.partialDeepStrictEqual(await fixture.state(), {
      crawl_partition: false,
      chunk_exists: false,
      entity_exists: false,
      batch_crawl_id: null,
      referral_crawl_id: null,
      discovery_crawl_id: null,
    })
  })
  record('clears crawl pointers and cascades remaining chunks before detaching crawls')

  await withFixture(async fixture => {
    await fixture.addUnexpectedCrawlReference()
    const errors = await fixture.retire(['crawls', 'rss_feed_crawls'])
    assert.equal(errors.length, 1)
    const cause = errors[0]?.cause
    assert.ok(cause && typeof cause === 'object' && 'code' in cause)
    assert.equal(cause.code, '23503')
    assert.partialDeepStrictEqual(await fixture.state(), {
      crawl_partition: true,
      chunk_exists: true,
      entity_exists: true,
      batch_crawl_id: '00000000-0000-7000-8000-000000000001',
      referral_crawl_id: '00000000-0000-7000-8000-000000000001',
      discovery_crawl_id: '00000000-0000-7000-8000-000000000001',
      rss_partition: false,
    })
  })
  record('rolls back a blocked partition and continues retiring independent partitions')
}

async function withFixture(run: (fixture: Fixture) => Promise<void>) {
  const deadline = performance.now() + 30_000
  let fixture: Fixture | undefined
  const errors: unknown[] = []
  try {
    fixture = await createMonthlyPartitionRetirementFixture(deadline)
    await run(fixture)
    if (performance.now() >= deadline)
      throw new Error('Monthly retirement control exceeded thirty seconds')
  } catch (err) {
    errors.push(err)
  } finally {
    if (fixture) {
      try {
        await fixture[Symbol.asyncDispose]()
      } catch (err) {
        errors.push(err)
      }
    }
  }
  if (performance.now() >= deadline)
    errors.push(new Error('Monthly retirement control and natural cleanup exceeded thirty seconds'))
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1)
    throw new AggregateError(errors, 'Monthly retirement control and cleanup failed', {
      cause: errors[0],
    })
}
