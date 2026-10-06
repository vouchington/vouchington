import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityBan,
  insertTestUserWarning,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createModerationAppeal } from './create.mts'
import { parseCreateModerationAppealInput } from './parse.mts'

const countAppeals = async (appellantId: string) => {
  const { rows } = await read<{ count: number }>(
    sql`SELECT count(*)::int AS count FROM moderation_appeals WHERE appellant_user_id = ${appellantId}`,
  )
  return rows[0]!.count
}

describe('createModerationAppeal inside the caller transaction', () => {
  let staff: PrivateUser
  let appellant: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
    appellant = await createTestUser()
  })

  async function banInput() {
    const community = await insertTestCommunity({
      name: `Joined Appeal ${crypto.randomUUID().slice(0, 8)}`,
      slug: `joined-appeal-${crypto.randomUUID().slice(0, 8)}`,
      createdById: staff.id,
    })
    const ban = await insertTestCommunityBan({
      communityId: community.id,
      userId: appellant.id,
      bannedById: staff.id,
      reason: 'Repeated violations',
    })
    return parseCreateModerationAppealInput({
      target_type: 'ban',
      target_id: ban.id,
      appeal_reason: 'Please review this ban.',
    })
  }

  it('commits the appeal with the caller and reads a repeat as the same appeal, not an error', async () => {
    const before = await countAppeals(appellant.id)
    const input = await banInput()
    await using query = await beginTransaction()

    const first = await createModerationAppeal(appellant, WEB_PROVENANCE, input, { query })
    // The target check cannot see the uncommitted first appeal, so this reaches the insert and
    // loses to it; that must read as a duplicate and leave the transaction usable.
    const second = await createModerationAppeal(appellant, WEB_PROVENANCE, input, { query })
    await query.commit()

    expect(first.isDuplicate).toBe(false)
    expect(second.isDuplicate).toBe(true)
    expect(second.appeal.id).toBe(first.appeal.id)
    expect(await countAppeals(appellant.id)).toBe(before + 1)
  })

  it('refreshes the reason of an open warning appeal and reports a duplicate', async () => {
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: 'spam',
    })
    const input = (reason: string) =>
      parseCreateModerationAppealInput({
        target_type: 'warning',
        target_id: warning.id,
        appeal_reason: reason,
      })
    await using query = await beginTransaction()

    const first = await createModerationAppeal(appellant, WEB_PROVENANCE, input('First reason.'), {
      query,
    })
    const second = await createModerationAppeal(
      appellant,
      WEB_PROVENANCE,
      input('Second reason.'),
      {
        query,
      },
    )
    await query.commit()

    expect(second.isDuplicate).toBe(true)
    expect(second.appeal.id).toBe(first.appeal.id)
    expect(second.appeal.appeal_reason).toBe('Second reason.')
  })

  it('leaves no appeal behind when the caller rolls back', async () => {
    const before = await countAppeals(appellant.id)
    const input = await banInput()
    {
      await using query = await beginTransaction()
      const created = await createModerationAppeal(appellant, WEB_PROVENANCE, input, { query })
      expect(created.isDuplicate).toBe(false)
    }

    expect(await countAppeals(appellant.id)).toBe(before)
  })
})
