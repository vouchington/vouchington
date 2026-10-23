import { afterAll, describe, expect, it } from 'vitest'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import {
  deleteTestTopicRevisionForGuard,
  insertTestOldTopicContentRevision,
  insertTestTopicNonContentRevision,
  updateTestTopicRevisionForGuard,
} from '@voucha/test-helpers/entities/content-history'
import { onGracefulShutdown } from '../index.mts'
import {
  getHistoryTablesWithoutMutationGuards,
  getHistoryActorContracts,
  getMediaAuthorityProgressColumns,
} from '../../../test-helpers/data-stores/psql/schema-history-contracts.mts'

describe('history storage contracts', () => {
  afterAll(onGracefulShutdown)

  it('guards every current revision and change ledger against mutation', async () => {
    const rows = await getHistoryTablesWithoutMutationGuards()
    expect(rows).toEqual([])
  })

  it('rejects revision rewrites and deletion of current or aged latest topic revisions', async () => {
    const administrator = await createTestUser({ administrator: true })
    const topicId = await insertTestTopic({
      name: `guarded-topic-${crypto.randomUUID()}`,
      slug: `guarded-topic-${crypto.randomUUID()}`,
      createdById: administrator.id,
    })
    const oldLatestId = await insertTestOldTopicContentRevision({
      topicId,
      revisedById: administrator.id,
      occurredAt: new Date('2024-01-01T00:00:00.000Z'),
    })
    await expect(deleteTestTopicRevisionForGuard(oldLatestId)).rejects.toMatchObject({
      code: '23514',
    })
    const revisionId = await insertTestTopicNonContentRevision(topicId, administrator.id)
    await expect(updateTestTopicRevisionForGuard(revisionId)).rejects.toMatchObject({
      code: '23514',
    })
    await expect(deleteTestTopicRevisionForGuard(revisionId)).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('retains change actors and erases only revision author links', async () => {
    const rows = await getHistoryActorContracts()
    expect(rows.filter(row => row.actor_column === 'changed_by_id')).toHaveLength(10)
    expect(rows.filter(row => row.actor_column === 'revised_by_id')).toHaveLength(4)
    expect(
      rows
        .filter(row => row.actor_column === 'changed_by_id')
        .every(
          row => row.target === 'retained_user_identities' && row.deletion === 'r' && row.ensured,
        ),
    ).toBe(true)
    expect(
      rows
        .filter(row => row.actor_column === 'revised_by_id')
        .every(row => row.target === 'users' && row.deletion === 'n'),
    ).toBe(true)
  })

  it('keeps mutable workflow progress off the media authority parent', async () => {
    const rows = await getMediaAuthorityProgressColumns()
    expect(rows).toEqual([])
  })
})
