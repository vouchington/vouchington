import { beforeEach, describe, expect, it } from 'vitest'
import {
  createReferralProgramFixture,
  createRandomString,
  createTestUser,
  insertPostElectionVote,
  insertTestPost,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createUserReferralLink } from '@services/user-referral-program-links'
import { getPrioritizedReferralLinks } from '../get-prioritized.mts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getVotedPostMaxAgeDays, prioritizedReferralLinksWorkConfig } from '../work-limits.mts'

const MILLISECONDS_PER_DAY = 86_400_000

let referralProgramId: string
let testHostname: string

async function createAuthorWithLink(label: string) {
  const user = await createTestUser()
  const link = await createUserReferralLink(user, WEB_PROVENANCE, {
    user_id: user.id,
    referral_program_id: referralProgramId,
    url: `https://${testHostname}/ref/${label}-${createRandomString(8)}`,
    label: `${label} link`,
  })
  return { user, linkId: link.id }
}

describe('get-prioritized rated-positively vote window', () => {
  beforeEach(async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = createRandomString(8)
    testHostname = `vote-window-${suffix}.example.com`
    const fixture = await createReferralProgramFixture({
      createdById: admin.id,
      randomSuffix: suffix,
      hostname: testHostname,
      pathname: '/ref/%',
    })
    referralProgramId = fixture.referralProgramId
  })

  it('counts a vote on a recent post but not a vote on a post older than the window', async () => {
    const [viewer, recentAuthor, staleAuthor] = await Promise.all([
      createTestUser(),
      createAuthorWithLink('recent'),
      createAuthorWithLink('stale'),
    ])
    const staleCreatedAt = new Date(
      Date.now() - (getVotedPostMaxAgeDays() + 10) * MILLISECONDS_PER_DAY,
    )
    const [recentPostId, stalePostId] = await Promise.all([
      insertTestPost({
        title: `Recent ${createRandomString(8)}`,
        slug: `recent-${createRandomString(8)}`,
        createdById: recentAuthor.user.id,
        markdown: 'content',
      }),
      insertTestPost({
        title: `Stale ${createRandomString(8)}`,
        slug: `stale-${createRandomString(8)}`,
        createdById: staleAuthor.user.id,
        markdown: 'content',
        createdAt: staleCreatedAt,
      }),
    ])
    await Promise.all([
      insertPostElectionVote(viewer.id, recentPostId, 1),
      insertPostElectionVote(viewer.id, stalePostId, 1),
    ])

    const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId)

    const byUser = Object.fromEntries(result.links.map(l => [l.user_id, l.priority_group]))
    expect(byUser[recentAuthor.user.id]).toBe(4)
    expect(byUser[staleAuthor.user.id]).toBeUndefined()
  })

  it('reads only the newest votes up to the configured recent vote limit', async () => {
    const [viewer, olderAuthor, newerAuthor] = await Promise.all([
      createTestUser(),
      createAuthorWithLink('older'),
      createAuthorWithLink('newer'),
    ])
    const [olderPostId, newerPostId] = await Promise.all(
      [olderAuthor, newerAuthor].map(author =>
        insertTestPost({
          title: `Vote limit ${createRandomString(8)}`,
          slug: `vote-limit-${createRandomString(8)}`,
          createdById: author.user.id,
          markdown: 'content',
        }),
      ),
    )
    // Votes are read newest id first, so the vote cast second is the one a limit of one keeps.
    await insertPostElectionVote(viewer.id, olderPostId, 1)
    await insertPostElectionVote(viewer.id, newerPostId, 1)
    await prioritizedReferralLinksWorkConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(prioritizedReferralLinksWorkConfig, {
      recent_vote_limit: 1,
    })
    try {
      const result = await getPrioritizedReferralLinks(viewer.id, referralProgramId)

      const byUser = Object.fromEntries(result.links.map(l => [l.user_id, l.priority_group]))
      expect(byUser[newerAuthor.user.id]).toBe(4)
      expect(byUser[olderAuthor.user.id]).toBeUndefined()
    } finally {
      restore()
    }
  })
})
