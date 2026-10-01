import { describe, expect, it } from 'vitest'
import { createMonthlyPartitionRetirementFixture } from '../../../test-helpers/monthly-partition-retirement.mts'

describe('monthly partition retirement foreign keys', () => {
  it('deletes embedding batch entities before detaching an expired chunk partition', async () => {
    await using fixture = await createMonthlyPartitionRetirementFixture()
    expect(await fixture.retire(['crawl_chunks'])).toEqual([])
    expect(await fixture.state()).toMatchObject({
      chunk_partition: false,
      chunk_exists: false,
      entity_exists: false,
      crawl_partition: true,
    })
  })

  it('clears crawl pointers and cascades remaining chunks before detaching crawls', async () => {
    await using fixture = await createMonthlyPartitionRetirementFixture()
    expect(await fixture.retire(['crawls'])).toEqual([])
    expect(await fixture.state()).toMatchObject({
      crawl_partition: false,
      chunk_exists: false,
      entity_exists: false,
      batch_crawl_id: null,
      referral_crawl_id: null,
    })
  })

  it('clears newer run parent pointers and deletes newer events before detaching runs', async () => {
    await using fixture = await createMonthlyPartitionRetirementFixture()
    expect(await fixture.retire(['conversation_message_agentic_runs'])).toEqual([])
    expect(await fixture.state()).toMatchObject({
      run_partition: false,
      run_parent_id: null,
      event_exists: false,
    })
  })

  it('rolls back a blocked partition and continues retiring independent partitions', async () => {
    await using fixture = await createMonthlyPartitionRetirementFixture()
    await fixture.addUnexpectedCrawlReference()
    const errors = await fixture.retire([
      'crawls',
      'rss_feed_crawls',
      'conversation_message_agentic_runs',
    ])
    expect(errors).toHaveLength(1)
    expect(errors[0]?.cause).toMatchObject({ code: '23503' })
    expect(await fixture.state()).toMatchObject({
      crawl_partition: true,
      chunk_exists: true,
      entity_exists: true,
      batch_crawl_id: '00000000-0000-7000-8000-000000000001',
      referral_crawl_id: '00000000-0000-7000-8000-000000000001',
      rss_partition: false,
      run_partition: false,
      run_parent_id: null,
      event_exists: false,
    })
  })
})
