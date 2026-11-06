import { describe, expect, it } from 'vitest'
import {
  createOwnedPostShareSeedFixture,
  readOwnedPostShareSeedRows,
} from '@voucha/test-helpers/explain-post-share-seed-fixture'
import { seedPostFeedShares } from './post-feed-shares.mts'

describe('post feed share EXPLAIN fixtures', () => {
  it('persists repeated deliveries under the declared sparse and dense owned targets', async () => {
    const identities = await createOwnedPostShareSeedFixture()
    await seedPostFeedShares(identities)
    const { rows, follows } = await readOwnedPostShareSeedRows(identities)
    const sparse = rows.filter(row => row.recipient_user_id === identities.recipientIds[0])
    const dense = rows.filter(row => row.recipient_user_id === identities.recipientIds[1])
    expect(rows).toHaveLength(4128)
    expect(sparse).toHaveLength(128)
    expect(new Set(sparse.map(row => row.post_id)).size).toBe(8)
    expect(new Set(sparse.map(row => row.id)).size).toBe(128)
    expect(sparse.every(row => row.id.replaceAll('-', '').at(12) === '7')).toBe(true)
    expect(dense).toHaveLength(4000)
    expect(new Set(dense.map(row => row.post_id)).size).toBe(1000)
    expect(new Set(dense.map(row => row.id)).size).toBe(4000)
    expect(dense.every(row => row.id.replaceAll('-', '').at(12) === '7')).toBe(true)
    expect(rows.every(row => row.shared_by_id === identities.sharedById)).toBe(true)
    expect(rows.every(row => identities.targetPostIds.includes(row.post_id))).toBe(true)
    expect(rows.filter(row => row.recipient_user_id === identities.emptyRecipientId)).toEqual([])
    expect(follows).toEqual([
      {
        subject_id: identities.emptyRecipientId,
        object_id: identities.sharedById,
        created_by_id: identities.emptyRecipientId,
      },
    ])
  })
})
