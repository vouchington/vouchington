import { describe, expect, it } from 'vitest'
import { read, write } from '@data-stores/psql'
import { createTestUser, insertEntityRelation, insertTestTopic } from '@voucha/test-helpers'
import {
  claimEngagementEmailSend,
  markEngagementEmailDeliveryAttempted,
  markEngagementEmailSent,
  releaseUnsentEngagementEmailClaim,
} from '@services/users/engagement-emails'
import { getUsersWorkLimit } from '@services/users/work-limits'
import {
  getFollowNewsSourcesRecipients,
  getFollowTopicsRecipients,
  getPostReferralLinkRecipients,
} from './dispatch-engagement-emails.mts'
import { readEngagementRecipientPage } from './recipient-page.mts'

async function candidateTypes(userId: string): Promise<string[]> {
  const { rows } = await read<{ email_type: string }>(
    `/* candidateTypes */ SELECT email_type FROM user_engagement_email_candidates
     WHERE user_id = $1::uuid ORDER BY email_type`,
    [userId],
  )
  return rows.map(row => row.email_type)
}

describe('engagement email admission projection', () => {
  it('retains global unclaimed-before-oldest-claim order and tracks terminal sends', async () => {
    const older = await createTestUser()
    const newer = await createTestUser()
    expect(await candidateTypes(older.id)).toEqual([
      'follow_topics',
      'post_referral_link',
      'follow_news_sources',
    ])
    expect(await claimEngagementEmailSend(older.id, 'follow_topics')).toBe(true)
    const { rows: claims } = await read<{ claimed_at: Date }>(
      `/* readEngagementAdmissionClaim */ SELECT claimed_at FROM user_engagement_email_sends
       WHERE user_id = $1::uuid AND email_type = 'follow_topics'`,
      [older.id],
    )
    const claimedAt = claims[0]!.claimed_at.getTime()
    const claimHours = getUsersWorkLimit('engagement_claim_hours')
    const beforeDue = new Date(claimedAt + (claimHours - 1) * 3_600_000)
    const afterDue = new Date(claimedAt + (claimHours + 1) * 3_600_000)
    expect((await getFollowTopicsRecipients([older.id], beforeDue)).map(row => row.id)).toEqual([])
    const recipients = await getFollowTopicsRecipients([older.id, newer.id], afterDue)
    expect(recipients.map(recipient => recipient.id)).toEqual([newer.id, older.id])

    expect(await markEngagementEmailDeliveryAttempted(older.id, 'follow_topics')).toBe(true)
    expect(
      (await getFollowTopicsRecipients([older.id, newer.id], afterDue)).map(row => row.id),
    ).toEqual([newer.id])
    expect(await candidateTypes(older.id)).not.toContain('follow_topics')
  })

  it('refreshes opt-out, primary-email, suspension, and follow transitions', async () => {
    const user = await createTestUser()
    const started = new Date()
    expect((await getPostReferralLinkRecipients(started, [user.id])).map(row => row.id)).toEqual([
      user.id,
    ])

    await write(
      `/* optOutEngagementAdmission */ UPDATE users SET is_engagement_emails_enabled = FALSE
       WHERE id = $1::uuid`,
      [user.id],
    )
    expect(await candidateTypes(user.id)).toEqual([])
    await write(
      `/* optInEngagementAdmission */ UPDATE users SET is_engagement_emails_enabled = TRUE
       WHERE id = $1::uuid`,
      [user.id],
    )
    expect(await candidateTypes(user.id)).toHaveLength(3)

    await write(
      `/* unselectPrimaryEngagementEmail */ UPDATE user_email_addresses SET is_primary = FALSE
       WHERE user_id = $1::uuid AND is_primary = TRUE`,
      [user.id],
    )
    expect(await candidateTypes(user.id)).toEqual([])
    await write(
      `/* selectPrimaryEngagementEmail */ UPDATE user_email_addresses SET is_primary = TRUE
       WHERE user_id = $1::uuid`,
      [user.id],
    )
    expect(await candidateTypes(user.id)).toHaveLength(3)

    const { rows: suspensions } = await write<{ id: string }>(
      `/* suspendEngagementAdmission */ INSERT INTO user_suspensions (user_id)
       VALUES ($1::uuid) RETURNING id`,
      [user.id],
    )
    expect(await candidateTypes(user.id)).toEqual([])
    await write(
      `/* liftEngagementAdmission */ UPDATE user_suspensions SET lifted_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid`,
      [suspensions[0]!.id],
    )
    expect(await candidateTypes(user.id)).toHaveLength(3)

    const topicId = await insertTestTopic({
      name: `Admission topic ${user.id}`,
      slug: `admission-topic-${user.id}`,
      createdById: user.id,
    })
    await insertEntityRelation('relation__user__follow__topic', user.id, topicId)
    expect(await candidateTypes(user.id)).not.toContain('follow_topics')
    await write(
      `/* unfollowEngagementAdmission */ UPDATE relation__user__follow__topic
       SET deleted_at = CURRENT_TIMESTAMP
       WHERE subject_id = $1::uuid AND object_id = $2::uuid AND deleted_at IS NULL`,
      [user.id, topicId],
    )
    expect(await candidateTypes(user.id)).toContain('follow_topics')
  })

  it('keeps ID ties and excludes claims made earlier in the same dispatch', async () => {
    const first = await createTestUser()
    const second = await createTestUser()
    const dispatchStartedAt = new Date(Date.now() - 1_000)
    expect(await claimEngagementEmailSend(first.id, 'follow_topics')).toBe(true)
    expect(
      (await getPostReferralLinkRecipients(dispatchStartedAt, [first.id, second.id])).map(
        row => row.id,
      ),
    ).toEqual([second.id])
    expect(await claimEngagementEmailSend(second.id, 'post_referral_link')).toBe(true)
    expect(
      (await getFollowNewsSourcesRecipients(dispatchStartedAt, [first.id, second.id])).map(
        row => row.id,
      ),
    ).toEqual([])

    const tied = await createTestUser()
    expect(await claimEngagementEmailSend(tied.id, 'post_referral_link')).toBe(true)
    await write(
      `/* tieEngagementAdmissionClaims */ UPDATE user_engagement_email_sends
       SET claimed_at = CURRENT_TIMESTAMP - INTERVAL '25 hours'
       WHERE user_id = ANY($1::uuid[]) AND email_type = 'post_referral_link'`,
      [[second.id, tied.id]],
    )
    const asOf = new Date()
    const expected = [second.id, tied.id].toSorted()
    expect(
      (await getPostReferralLinkRecipients(asOf, [second.id, tied.id], asOf)).map(row => row.id),
    ).toEqual(expected)
  })

  it('continues across distinct claims within one millisecond without rounding the cursor', async () => {
    const users = await Promise.all([createTestUser(), createTestUser(), createTestUser()])
    for (const user of users) {
      expect(await claimEngagementEmailSend(user.id, 'post_referral_link')).toBe(true)
    }
    await write(
      `/* microsecondEngagementAdmissionClaims */ UPDATE user_engagement_email_sends sends
       SET claimed_at = date_trunc('milliseconds', CURRENT_TIMESTAMP - INTERVAL '25 hours')
         + (ordered.position * INTERVAL '100 microseconds')
       FROM (SELECT user_id, row_number() OVER (ORDER BY user_id DESC) AS position
             FROM user_engagement_email_sends
             WHERE user_id = ANY($1::uuid[]) AND email_type = 'post_referral_link') ordered
       WHERE sends.user_id = ordered.user_id AND sends.email_type = 'post_referral_link'`,
      [users.map(user => user.id)],
    )
    const expected = users
      .map(user => user.id)
      .toSorted()
      .toReversed()
    const asOf = new Date()
    const dispatchStartedAt = asOf
    let cursor: { lane: 'unclaimed' | 'claimed'; afterUserId: string; afterClaimedAt?: string } = {
      lane: 'claimed',
      afterUserId: '00000000-0000-0000-0000-000000000000',
    }
    const seen: string[] = []
    const cursors: Array<typeof cursor | undefined> = []
    for (const expectedUserId of expected) {
      const page = await readEngagementRecipientPage({
        type: 'post_referral_link',
        dispatchStartedAt,
        asOf,
        userIds: users.map(candidate => candidate.id),
        cursor,
        rawLimit: 1,
        eligibleLimit: 2,
      })
      expect(page.scannedCount).toBe(1)
      expect(page.recipients).toHaveLength(1)
      expect(page.recipients[0]?.id).toBe(expectedUserId)
      seen.push(page.recipients[0]!.id)
      cursors.push(page.nextCursor)
      if (page.nextCursor) cursor = page.nextCursor
    }
    expect(seen).toEqual(expected)
    expect(cursors.slice(0, -1).map(next => next?.afterClaimedAt)).toEqual(
      Array.from({ length: users.length - 1 }, () => expect.stringContaining(':')),
    )
    expect(cursors.at(-1)).toBeUndefined()
  })

  it('fences a delayed send after another dispatcher owns an expired claim', async () => {
    const user = await createTestUser()
    const priorOwner = `engagement-prior-${user.id}`
    const currentOwner = `engagement-current-${user.id}`
    expect(await claimEngagementEmailSend(user.id, 'post_referral_link', priorOwner)).toBe(true)
    await write(
      `/* expireEngagementOwnedClaim */ UPDATE user_engagement_email_sends
       SET claimed_at = CURRENT_TIMESTAMP - INTERVAL '25 hours'
       WHERE user_id = $1::uuid AND email_type = 'post_referral_link'`,
      [user.id],
    )
    expect(await claimEngagementEmailSend(user.id, 'post_referral_link', currentOwner)).toBe(true)
    expect(
      await markEngagementEmailDeliveryAttempted(user.id, 'post_referral_link', priorOwner),
    ).toBe(false)
    expect(await releaseUnsentEngagementEmailClaim(user.id, 'post_referral_link', priorOwner)).toBe(
      false,
    )
    expect(await markEngagementEmailSent(user.id, 'post_referral_link', priorOwner)).toBe(false)
    expect(
      await markEngagementEmailDeliveryAttempted(user.id, 'post_referral_link', currentOwner),
    ).toBe(true)
    expect(await markEngagementEmailSent(user.id, 'post_referral_link', currentOwner)).toBe(true)
  })
})
