import { beforeEach, describe, expect, it, onTestFinished } from 'vitest'
import {
  createReferralProgramFixture,
  createRandomString,
  createTestUser,
  insertTestLocalFollow,
  insertTestMute,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { encodeCursor } from '@modules/pagination'
import { createUserReferralLink } from '@services/user-referral-program-links'
import { getPrioritizedReferralLinks } from '../get-prioritized.mts'
import { prioritizedReferralLinksWorkConfig } from '../work-limits.mts'

let referralProgramId: string
let testHostname: string

async function createAuthorWithLink(label: string) {
  const user = await createTestUser()
  await createUserReferralLink(user, WEB_PROVENANCE, {
    user_id: user.id,
    referral_program_id: referralProgramId,
    url: `https://${testHostname}/ref/${label}-${createRandomString(8)}`,
    label: `${label} link`,
  })
  return user
}

async function createAuthors(count: number) {
  const authors = []
  for (let i = 0; i < count; i++) authors.push(await createAuthorWithLink(`author-${i}`))
  return authors
}

const ids = (page: { links: { id: string }[] }) => page.links.map(link => link.id)

describe('get-prioritized client limit and cursor', () => {
  beforeEach(async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = createRandomString(8)
    testHostname = `paging-${suffix}.example.com`
    const fixture = await createReferralProgramFixture({
      createdById: admin.id,
      randomSuffix: suffix,
      hostname: testHostname,
      pathname: '/ref/%',
    })
    referralProgramId = fixture.referralProgramId
  })

  it('honors the requested limit instead of the default', async () => {
    await createAuthors(4)

    const result = await getPrioritizedReferralLinks(null, referralProgramId, { limit: 2 })

    expect(result.links).toHaveLength(2)
    expect(result.page_info.has_next_page).toBe(true)
    expect((await getPrioritizedReferralLinks(null, referralProgramId)).links).toHaveLength(4)
  })

  it('pages one ranking without repeating or skipping a link', async () => {
    await createAuthors(7)
    const viewer = await createTestUser()
    const whole = await getPrioritizedReferralLinks(viewer.id, referralProgramId, { limit: 25 })
    expect(whole.links).toHaveLength(7)

    const pages = []
    let after: string | undefined
    do {
      const page = await getPrioritizedReferralLinks(viewer.id, referralProgramId, {
        limit: 3,
        after,
      })
      pages.push(page)
      after = page.page_info.end_cursor ?? undefined
    } while (after)

    expect(pages.map(page => page.links.length)).toEqual([3, 3, 1])
    expect(pages.map(page => page.page_info.has_next_page)).toEqual([true, true, false])
    expect(pages.flatMap(ids)).toEqual(ids(whole))
  })

  it('still fills the page when the viewer muted the top links', async () => {
    await createAuthors(6)
    const viewer = await createTestUser()
    const ranked = await getPrioritizedReferralLinks(null, referralProgramId, { limit: 25 })
    const topTwo = ranked.links.slice(0, 2).map(link => link.user_id!)
    await Promise.all(topTwo.map(userId => insertTestMute(viewer.id, userId)))

    const page = await getPrioritizedReferralLinks(viewer.id, referralProgramId, { limit: 3 })

    expect(page.links).toHaveLength(3)
    expect(page.links.map(link => link.user_id)).toEqual(
      ranked.links.slice(2, 5).map(link => link.user_id),
    )
  })

  it('keeps its place when the link at the cursor is muted between pages', async () => {
    await createAuthors(5)
    const viewer = await createTestUser()
    const first = await getPrioritizedReferralLinks(viewer.id, referralProgramId, { limit: 2 })
    await insertTestMute(viewer.id, first.links[1].user_id!)

    const second = await getPrioritizedReferralLinks(viewer.id, referralProgramId, {
      limit: 2,
      after: first.page_info.end_cursor!,
    })

    const whole = await getPrioritizedReferralLinks(null, referralProgramId, { limit: 25 })
    expect(ids(second)).toEqual(ids(whole).slice(2, 4))
  })

  it('returns one page and no cursor when the viewer has network links', async () => {
    const [viewer, ...followed] = await Promise.all([
      createTestUser(),
      ...Array.from({ length: 4 }, (_, i) => createAuthorWithLink(`followed-${i}`)),
    ])
    await createAuthors(3)
    await Promise.all(followed.map(user => insertTestLocalFollow(viewer.id, user.id)))

    const page = await getPrioritizedReferralLinks(viewer.id, referralProgramId, { limit: 2 })

    expect(page.links).toHaveLength(2)
    expect(page.links.every(link => followed.some(user => user.id === link.user_id))).toBe(true)
    expect(page.page_info).toEqual({ has_next_page: false, start_cursor: null, end_cursor: null })
  })

  it('does not read more network people than the requested limit per group', async () => {
    const [viewer, ...followed] = await Promise.all([
      createTestUser(),
      ...Array.from({ length: 6 }, (_, i) => createAuthorWithLink(`followed-${i}`)),
    ])
    await Promise.all(followed.map(user => insertTestLocalFollow(viewer.id, user.id)))

    const one = await getPrioritizedReferralLinks(viewer.id, referralProgramId, { limit: 1 })
    const five = await getPrioritizedReferralLinks(viewer.id, referralProgramId, { limit: 5 })

    expect(one.links).toHaveLength(1)
    expect(five.links).toHaveLength(5)
  })

  it('clamps a limit above the maximum and below one', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(prioritizedReferralLinksWorkConfig, {
        personalized_link_max_limit: 4,
      }),
    )
    await createAuthors(6)

    const above = await getPrioritizedReferralLinks(null, referralProgramId, { limit: 100 })
    const below = await getPrioritizedReferralLinks(null, referralProgramId, { limit: 0 })

    expect(above.links).toHaveLength(4)
    expect(below.links).toHaveLength(1)
  })

  it('applies a lowered maximum to an already cached list at once', async () => {
    await createAuthors(6)
    expect(
      (await getPrioritizedReferralLinks(null, referralProgramId, { limit: 25 })).links,
    ).toHaveLength(6)
    onTestFinished(
      overrideDynamicConfigFieldsForTest(prioritizedReferralLinksWorkConfig, {
        personalized_link_max_limit: 2,
      }),
    )

    const result = await getPrioritizedReferralLinks(null, referralProgramId, { limit: 25 })

    expect(result.links).toHaveLength(2)
  })

  it('refuses a cursor that is not on the ranked list', async () => {
    await createAuthors(2)
    const stranger = await createTestUser()

    await expect(
      getPrioritizedReferralLinks(null, referralProgramId, {
        limit: 1,
        after: encodeCursor({ id: stranger.id }),
      }),
    ).rejects.toMatchObject({ status: 400 })
  })
})
