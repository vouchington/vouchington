import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { getDateFromUUIDv7 } from '@modules/utils/ids'
import { createTestUserDirect } from './entities/users.mts'

type Selector = (
  afterId: string | null,
  limit: number,
  options?: { now?: Date },
) => Promise<{ userIds: string[]; nextCursor: string | null }>

export async function createVoteWeightRecalculationFixture() {
  const first = await createTestUserDirect({
    username: `test-vw-find-${randomBytes(4).toString('hex')}`,
  })
  const second = await createTestUserDirect({
    username: `test-vw-find-${randomBytes(4).toString('hex')}`,
  })
  const [earlier, user] = [first, second].toSorted((a, b) => a.id.localeCompare(b.id))
  assert(earlier && user, 'Expected owned vote-weight fixtures')
  const createdAt = getDateFromUUIDv7(user.id)
  assert(createdAt, 'Expected a UUIDv7 vote-weight fixture')
  // Relative business timestamps remain after account creation on every calendar date.
  const referenceTime = createdAt.getTime() + 240_000
  return {
    user,
    afterId: earlier.id,
    now: new Date(referenceTime),
    referenceTime,
    futureExpiry: new Date(referenceTime + 86_400_000),
  }
}

/** Read bounded production pages until their cursor passes the owned ID window. */
export async function collectVoteWeightFixtureResults(
  select: Selector,
  afterId: string,
  throughId: string,
  now?: Date,
) {
  const userIds: string[] = []
  let cursor = afterId
  while (cursor < throughId) {
    const result = await select(cursor, 25, now ? { now } : undefined)
    let previous = cursor
    for (const id of result.userIds) {
      assert(id > previous, 'Vote-weight selection must advance its cursor')
      previous = id
      if (id <= throughId) userIds.push(id)
    }
    if (result.nextCursor === null) break
    assert.equal(result.nextCursor, previous, 'Vote-weight cursor must identify the last row')
    assert(result.nextCursor > cursor, 'Vote-weight pagination must advance')
    cursor = result.nextCursor
  }
  return { userIds }
}
