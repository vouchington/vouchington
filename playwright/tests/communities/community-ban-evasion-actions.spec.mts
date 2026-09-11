import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  setTestBanEvasionFlag,
  insertTestSystemModerationReport,
} from '../../../backend/test-helpers/index.mts'

const seededReportCreatedAt = new Date(Date.UTC(9999, 11, 31, 23, 59, 59, 999))

async function seedCommunityBanEvasionReport(suffix: string) {
  const source = requireTestValue(
    await createTestUser({ username: `cbe-src-${suffix}` }),
    'Failed to create source user',
  )
  const suspect = requireTestValue(
    await createTestUser({ username: `cbe-sus-${suffix}` }),
    'Failed to create suspect user',
  )

  const slug = `cbe-act-${suffix}`
  const community = await insertTestCommunity({
    createdById: source.id,
    visibility: 'public',
    slug,
  })
  await insertTestCommunityMember({ communityId: community.id, userId: source.id, role: 'owner' })
  await insertTestCommunityMember({ communityId: community.id, userId: suspect.id })

  await setTestBanEvasionFlag({
    communityId: community.id,
    userId: suspect.id,
    sourceUserId: source.id,
    score: 0.85,
  })
  const reportId = await insertTestSystemModerationReport(
    'user',
    suspect.id,
    `Suspected ban evasion ${suffix}`,
    seededReportCreatedAt,
  )

  return { slug, communityId: community.id, sourceId: source.id, suspectId: suspect.id, reportId }
}

test.describe('Community ban-evasion — CO redacted evidence', () => {
  test('owner sees dismiss-only controls when ban-evasion evidence is redacted', async ({
    page,
  }) => {
    const { slug, sourceId } = await seedCommunityBanEvasionReport(randomSuffix())
    await loginAsUser(page, sourceId)
    await navigateTo(page, `/communities/${slug}/settings/moderation`)

    await expect(page.getByTestId('community-ban-evasion-badge')).toBeVisible()
    await expect(page.getByTestId('community-ban-evasion-confirm')).not.toBeAttached()
    await expect(page.getByTestId('community-ban-evasion-dismiss')).toBeVisible()
  })
})

test.describe('Community ban-evasion — CM persona', () => {
  test('community moderator sees ban-evasion controls for plain members', async ({ page }) => {
    const suffix = randomSuffix()
    const owner = requireTestValue(
      await createTestUser({ username: `cbe-cm-own-${suffix}` }),
      'Failed to create owner',
    )
    const moderator = requireTestValue(
      await createTestUser({ username: `cbe-cm-mod-${suffix}` }),
      'Failed to create moderator',
    )
    const suspect = requireTestValue(
      await createTestUser({ username: `cbe-cm-sus-${suffix}` }),
      'Failed to create suspect',
    )

    const slug = `cbe-cm-${suffix}`
    const community = await insertTestCommunity({
      createdById: owner.id,
      visibility: 'public',
      slug,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })
    // Suspect must be 'member' — moderators can only ban regular members
    await insertTestCommunityMember({
      communityId: community.id,
      userId: suspect.id,
      role: 'member',
    })

    await setTestBanEvasionFlag({
      communityId: community.id,
      userId: suspect.id,
      sourceUserId: owner.id,
      score: 0.85,
    })
    // A moderation report is required to surface the ban-evasion badge in the queue
    await insertTestSystemModerationReport(
      'user',
      suspect.id,
      `Suspected ban evasion CM ${suffix}`,
      seededReportCreatedAt,
    )

    await loginAsUser(page, moderator.id)
    await navigateTo(page, `/communities/${slug}/settings/moderation`)

    await expect(page.getByTestId('community-ban-evasion-badge')).toBeVisible()
    await expect(page.getByTestId('community-ban-evasion-confirm')).not.toBeAttached()
    await expect(page.getByTestId('community-ban-evasion-dismiss')).toBeVisible()

    // CM can dismiss
    const dismissResponse = page.waitForResponse(
      resp => resp.url().includes('/ban-evasion') && resp.request().method() === 'DELETE',
    )
    await page.getByTestId('community-ban-evasion-dismiss').click()
    await dismissResponse

    await expect(page.getByTestId('community-ban-evasion-badge')).not.toBeAttached()
  })

  test('community moderator cannot confirm when evidence is redacted', async ({ page }) => {
    const suffix = randomSuffix()
    const owner = requireTestValue(
      await createTestUser({ username: `cbe-cm-cnf-own-${suffix}` }),
      'Failed to create owner',
    )
    const moderator = requireTestValue(
      await createTestUser({ username: `cbe-cm-cnf-mod-${suffix}` }),
      'Failed to create moderator',
    )
    const suspect = requireTestValue(
      await createTestUser({ username: `cbe-cm-cnf-sus-${suffix}` }),
      'Failed to create suspect',
    )

    const slug = `cbe-cm-cnf-${suffix}`
    const community = await insertTestCommunity({
      createdById: owner.id,
      visibility: 'public',
      slug,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: suspect.id,
      role: 'member',
    })

    await setTestBanEvasionFlag({
      communityId: community.id,
      userId: suspect.id,
      sourceUserId: owner.id,
      score: 0.85,
    })
    await insertTestSystemModerationReport(
      'user',
      suspect.id,
      `Suspected ban evasion CM confirm ${suffix}`,
      seededReportCreatedAt,
    )

    await loginAsUser(page, moderator.id)
    await navigateTo(page, `/communities/${slug}/settings/moderation`)

    await expect(page.getByTestId('community-ban-evasion-badge')).toBeVisible()
    await expect(page.getByTestId('community-ban-evasion-confirm')).not.toBeAttached()
    await expect(page.getByTestId('community-ban-evasion-dismiss')).toBeVisible()
  })
})
