import assert from 'node:assert'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createRandomString } from '../data.mts'
import type { PrivateUser } from '@voucha/types/entities/user'

// Raw-primitive substitute for @services/users' getPrivateUsersByAnyBatch, restricted to the
// plain-UUID lookup this file always performs (ids from a fresh bulk insert, never
// email/username/phone identifiers) — a pure read with no side effects, so the simplification
// is safe. The real function's multi-identifier-type batch CTE machinery isn't needed here. This
// package must never depend on a service that already devDeps this package for its own tests.
async function getTestPrivateUsersByIds(
  userIds: string[],
): Promise<Array<PrivateUser | undefined>> {
  if (userIds.length === 0) return []
  const { rows } = await read<PrivateUser>(sql`/* getTestPrivateUsersByIds */
    SELECT * FROM view_users_private WHERE id = ANY(${userIds})
  `)
  const byId = new Map(rows.map(row => [row.id, row]))
  return userIds.map(id => byId.get(id))
}

export async function createTestUsersDirect(count: number): Promise<PrivateUser[]> {
  if (count <= 0) return []
  const usernames = Array.from({ length: count }, () => `test-user-${createRandomString(12)}`)

  const { rows } = await write<{ id: string }>(sql`
    INSERT INTO users (username)
    SELECT unnest(${usernames}::text[])
    RETURNING id
  `)

  const userIds = rows.map(row => row.id)
  const users = await getTestPrivateUsersByIds(userIds)

  const result: PrivateUser[] = []
  for (let i = 0; i < userIds.length; i++) {
    const user = users[i]
    assert(user, `User at index ${i} not found after bulk insert`)
    result.push(user)
  }
  return result
}
