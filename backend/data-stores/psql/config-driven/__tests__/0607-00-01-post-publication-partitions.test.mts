import { describe, expect, it } from 'vitest'
import createPostPublicationPartitions from '../0607-00-01-post-publication-partitions.mts'

describe('createPostPublicationPartitions', () => {
  it('creates default children for durable post identities, receipts, and retained work keys', () => {
    const sql = createPostPublicationPartitions()
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS post_publication_post_identities__default')
    expect(sql).toContain('PARTITION OF post_publication_post_identities DEFAULT')

    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS post_publication_projection_receipts__default',
    )
    expect(sql).toContain('PARTITION OF post_publication_projection_receipts DEFAULT')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS post_publication_dirty_work_keys__default')
    expect(sql).toContain('PARTITION OF post_publication_dirty_work_keys DEFAULT')
  })
})
