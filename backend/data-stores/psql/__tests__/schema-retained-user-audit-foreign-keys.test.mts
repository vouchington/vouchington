import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createTestPost } from '../../../test-helpers/entities/create-test-entities.mts'
import {
  countTestRetainedUserAuditRows,
  insertTestRetainedUserAuditRow,
  retainedUserAuditReferences,
} from '../../../test-helpers/entities/retained-user-audit-references.mts'
import { createTestUser } from '../../../test-helpers/entities/users.mts'
import { beginTransaction, onGracefulShutdown, read } from '../index.mts'

describe('retained-user audit foreign keys', () => {
  afterAll(onGracefulShutdown)

  it.each(retainedUserAuditReferences)(
    '$table.$column restricts deletes of an indexed, validated retained user root',
    async ({ table, column, constraint }) => {
      const { rows } = await read<{
        target: string
        delete_action: string
        validated: boolean
        leading_column: string | null
      }>(
        `/* readRetainedUserAuditForeignKey */
        SELECT c.confrelid::regclass::text AS target, c.confdeltype::text AS delete_action,
          c.convalidated AS validated,
          (SELECT a.attname FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
            WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1] AND i.indisvalid
            LIMIT 1) AS leading_column
        FROM pg_constraint c
        WHERE c.conrelid = $1::regclass AND c.conname = $2 AND c.conparentid = 0`,
        [table, constraint],
      )
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

  it.each(retainedUserAuditReferences)(
    'rejects $table.$column naming a user with no retained identity',
    async ({ table, constraint }) => {
      const post = await createTestPost()
      await using query = await beginTransaction()
      await expect(
        insertTestRetainedUserAuditRow(query, table, randomUUID(), post.id),
      ).rejects.toMatchObject({ code: '23503', constraint })
    },
  )

  it.each(retainedUserAuditReferences)(
    'keeps $table rows and the retained user root when the live user is hard-deleted',
    async ({ table }) => {
      const user = await createTestUser()
      const post = await createTestPost()
      await using query = await beginTransaction()
      await insertTestRetainedUserAuditRow(query, table, user.id, post.id)

      await query('/* hardDeleteUserWithRetainedAudit */ DELETE FROM users WHERE id = $1', [
        user.id,
      ])

      expect(await countTestRetainedUserAuditRows(query, table, user.id)).toBe(1)
      const { rowCount: rootCount } = await query(
        '/* readRetainedUserRootAfterDelete */ SELECT 1 FROM retained_user_identities WHERE id = $1',
        [user.id],
      )
      expect(rootCount).toBe(1)
    },
  )

  it.each(retainedUserAuditReferences)(
    'refuses to delete a retained user root that $table still references',
    async ({ table, constraint }) => {
      const user = await createTestUser()
      const post = await createTestPost()
      await using query = await beginTransaction()
      await insertTestRetainedUserAuditRow(query, table, user.id, post.id)
      await query('/* hardDeleteUserWithRetainedAudit */ DELETE FROM users WHERE id = $1', [
        user.id,
      ])

      await expect(
        query(
          '/* deleteReferencedRetainedUserRoot */ DELETE FROM retained_user_identities WHERE id = $1',
          [user.id],
        ),
      ).rejects.toMatchObject({ constraint })
    },
  )
})
