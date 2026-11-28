import { randomUUID } from 'node:crypto'
import { onGracefulShutdown } from '@data-stores/graceful-shutdown'
import { afterAll, describe, expect, it } from 'vitest'
import { readForeignKeyWithLeadingIndex } from '../../../test-helpers/data-stores/psql/schema-catalog.mts'
import {
  deleteReferencedRetainedUserRootAfterLiveDelete,
  hardDeleteUserWithRetainedAudit,
  insertClearanceChangeAndCountRetainedActor,
  insertRetainedUserAuditRowInTransaction,
} from '../../../test-helpers/data-stores/psql/schema-retained-user-audit-foreign-keys.mts'
import { createTestPost } from '../../../test-helpers/entities/create-test-entities.mts'
import { retainedUserAuditReferences } from '../../../test-helpers/entities/retained-user-audit-references.mts'
import { createTestUser } from '../../../test-helpers/entities/users.mts'

describe('retained-user audit foreign keys', () => {
  afterAll(() => onGracefulShutdown('SIGTERM'))

  it.each(retainedUserAuditReferences)(
    '$table.$column restricts deletes of an indexed, validated retained user root',
    async ({ table, column, constraint }) => {
      const rows = await readForeignKeyWithLeadingIndex(table, constraint)
      expect(rows).toEqual([
        {
          target: 'retained_user_identities',
          delete_action: 'r',
          validated: true,
          leading_column: column,
        },
      ])
    },
  )

  it.each(retainedUserAuditReferences.filter(({ table }) => table !== 'post_clearance_changes'))(
    'rejects $table.$column naming a user with no retained identity',
    async ({ table, constraint }) => {
      const post = await createTestPost()
      await expect(
        insertRetainedUserAuditRowInTransaction(table, randomUUID(), post.id),
      ).rejects.toMatchObject({ code: '23503', constraint })
    },
  )

  it('ensures a retained clearance actor before appending its change', async () => {
    const actorId = randomUUID()
    const post = await createTestPost()
    const { retainedRootCount, auditRowCount } = await insertClearanceChangeAndCountRetainedActor(
      actorId,
      post.id,
    )
    expect(retainedRootCount).toBe(1)
    expect(auditRowCount).toBe(1)
  })

  it.each(retainedUserAuditReferences)(
    'keeps $table rows and the retained user root when the live user is hard-deleted',
    async ({ table }) => {
      const user = await createTestUser()
      const post = await createTestPost()
      const { auditRowCount, retainedRootCount } = await hardDeleteUserWithRetainedAudit(
        table,
        user.id,
        post.id,
      )
      expect(auditRowCount).toBe(1)
      expect(retainedRootCount).toBe(1)
    },
  )

  it.each(retainedUserAuditReferences)(
    'refuses to delete a retained user root that $table still references',
    async ({ table, constraint }) => {
      const user = await createTestUser()
      const post = await createTestPost()
      await expect(
        deleteReferencedRetainedUserRootAfterLiveDelete(table, user.id, post.id),
      ).rejects.toMatchObject({ constraint })
    },
  )
})
