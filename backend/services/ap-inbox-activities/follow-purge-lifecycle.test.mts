import { startPausedTestUserSoftDeletion } from '@voucha/test-helpers/entities/user-deletion'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { beginTransaction, softDeleteUser } from '@voucha/test-helpers'
import {
  createFederatedUser,
  createRemoteActorFixture,
} from '@voucha/test-helpers/ap-inbox-activity-fixtures'
import { readTerminalActivityIdentitiesForTest } from '@voucha/test-helpers/activitypub-terminal-identities'
import { terminalizePurgedUserRemoteFollows } from '../data-retention/cleanup-federation-purge-identities.mts'
import { markRemoteFollowUndone, reserveRemoteFollowCycle } from './follow-cycles.mts'

const activityId = () => `https://remote.example/activities/${randomUUID()}`

describe('remote Follow identity at user purge', () => {
  it('terminalizes active identities in bounded pages without moving prior terminal time or another user', async () => {
    const actor = await createRemoteActorFixture()
    const secondActor = await createRemoteActorFixture()
    const target = await createFederatedUser()
    const other = await createFederatedUser()
    const [firstId, secondId, terminalId, otherId] = Array.from({ length: 4 }, activityId)
    await reserveRemoteFollowCycle(firstId!, actor.id, target.id, {})
    await reserveRemoteFollowCycle(secondId!, secondActor.id, target.id, {})
    await markRemoteFollowUndone(terminalId!, actor, target.id, {})
    await reserveRemoteFollowCycle(otherId!, actor.id, other.id, {})
    await softDeleteUser(target.id)

    await using query = await beginTransaction()
    const before = await readTerminalActivityIdentitiesForTest(query, 'follow', [
      firstId!,
      secondId!,
      terminalId!,
      otherId!,
    ])
    const terminalBefore = before.find(row => row.activityId === terminalId)?.terminalAt
    expect(terminalBefore).toBeInstanceOf(Date)

    expect(await terminalizePurgedUserRemoteFollows(query, target.id, 1)).toBe(1)
    const afterFirst = await readTerminalActivityIdentitiesForTest(query, 'follow', [
      firstId!,
      secondId!,
      terminalId!,
      otherId!,
    ])
    expect(afterFirst.filter(row => row.terminalAt !== null)).toHaveLength(2)
    expect(afterFirst.find(row => row.activityId === terminalId)?.terminalAt).toEqual(
      terminalBefore,
    )
    expect(afterFirst.find(row => row.activityId === otherId)?.terminalAt).toBeNull()

    expect(await terminalizePurgedUserRemoteFollows(query, target.id, 1)).toBe(1)
    expect(await terminalizePurgedUserRemoteFollows(query, target.id, 1)).toBe(0)
    const afterFinal = await readTerminalActivityIdentitiesForTest(query, 'follow', [
      firstId!,
      secondId!,
      terminalId!,
      otherId!,
    ])
    expect(afterFinal.filter(row => row.terminalAt !== null)).toHaveLength(3)
    expect(afterFinal.find(row => row.activityId === terminalId)?.terminalAt).toEqual(
      terminalBefore,
    )
    expect(afterFinal.find(row => row.activityId === otherId)?.terminalAt).toBeNull()
    await query.commit()
  })

  it('does not fence a pending deletion and refuses a Follow after deletion commits', async () => {
    const actor = await createRemoteActorFixture()
    const target = await createFederatedUser()
    const id = activityId()
    const deletion = await startPausedTestUserSoftDeletion(target.id)
    try {
      await expect(reserveRemoteFollowCycle(id, actor.id, target.id, {})).resolves.toMatchObject({
        isNew: true,
      })
      deletion.release()
      await deletion.completed
      const retiredId = activityId()
      await expect(reserveRemoteFollowCycle(retiredId, actor.id, target.id, {})).rejects.toThrow(
        'ActivityPub Follow id belongs to another actor or target',
      )
      await using query = await beginTransaction()
      expect(await readTerminalActivityIdentitiesForTest(query, 'follow', [retiredId])).toEqual([])
    } finally {
      deletion.release()
      await deletion.completed
    }
  })
})
