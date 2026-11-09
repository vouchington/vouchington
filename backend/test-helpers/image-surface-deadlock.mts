import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { writeTestImageSurfaceMutation } from './image-surface-mutation.mts'
import { createTestPostgresLockWaiter } from './postgres-lock-waiter.mts'

type Outcome = { status: 'committed' } | { status: 'rejected'; reason: unknown }

/** Two real profile edits acquire opposite owner rows; PostgreSQL chooses the deadlock victim. */
export async function raceTestImageSurfaceDeadlock(
  first: { userId: string; imageId: string },
  second: { userId: string; imageId: string },
): Promise<Outcome[]> {
  await using holder = await beginTransaction()
  await holder(sql`/* raceTestImageSurfaceDeadlock:secondProfile */
    UPDATE users SET markdown = ${`second-${crypto.randomUUID()}`} WHERE id = ${second.userId}`)
  await using waiter = await createTestPostgresLockWaiter({
    holder,
    lock: { kind: 'transaction' },
    selected: {
      marker: '/* writeTestUserImageSurface */',
      binding: { index: 1, value: second.userId },
    },
  })
  const waiting = (async (): Promise<Outcome> => {
    const query = waiter.query
    await query(sql`/* raceTestImageSurfaceDeadlock:firstProfile */
      UPDATE users SET markdown = ${`first-${crypto.randomUUID()}`} WHERE id = ${first.userId}`)
    try {
      await writeTestImageSurfaceMutation(
        { surfaceKind: 'user-profile-image', userId: second.userId },
        second.imageId,
        second.userId,
        query,
      )
      await query.commit()
      return { status: 'committed' }
    } catch (err) {
      return { status: 'rejected', reason: err }
    } finally {
      await query[Symbol.asyncDispose]()
    }
  })()
  await waiter.waitForLock(waiting)
  let other: Outcome
  try {
    await writeTestImageSurfaceMutation(
      { surfaceKind: 'user-profile-image', userId: first.userId },
      first.imageId,
      first.userId,
      holder,
    )
    await holder.commit()
    other = { status: 'committed' }
  } catch (err) {
    other = { status: 'rejected', reason: err }
  } finally {
    await holder[Symbol.asyncDispose]()
  }
  return [await waiting, other]
}

export async function readTestDeadlockProfileImages(userIds: readonly string[]) {
  const { rows } = await read<{ id: string; profile_image_id: string | null }>(sql`
    /* readTestDeadlockProfileImages */ SELECT id, profile_image_id FROM users
    WHERE id = ANY(${userIds}::uuid[]) ORDER BY id ASC`)
  return rows
}
