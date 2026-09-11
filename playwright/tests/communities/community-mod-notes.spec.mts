import { expect, test } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '../../../backend/test-helpers/index.mts'

let ownerUserId = ''
let moderatorUserId = ''
let memberUserId = ''
let communitySlug = ''
let suffix = ''

test.beforeAll(async () => {
  suffix = randomSuffix()

  const owner = await createTestUser({ username: `mod-notes-owner-${suffix}` })
  if (!owner) throw new Error('Failed to create owner')
  ownerUserId = owner.id

  const moderator = await createTestUser({ username: `mod-notes-mod-${suffix}` })
  if (!moderator) throw new Error('Failed to create moderator')
  moderatorUserId = moderator.id

  const member = await createTestUser({ username: `mod-notes-member-${suffix}` })
  if (!member) throw new Error('Failed to create member')
  memberUserId = member.id

  communitySlug = `mod-notes-community-${suffix}`
  const community = await insertTestCommunity({
    createdById: owner.id,
    visibility: 'public',
    slug: communitySlug,
  })

  await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  await insertTestCommunityMember({
    communityId: community.id,
    userId: moderator.id,
    role: 'moderator',
  })
  await insertTestCommunityMember({ communityId: community.id, userId: member.id })
})

test.describe('Community Mod Notes — Community Owner', () => {
  test('owner can add a community-scoped mod note on the members page', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/members`)

    // Scope to the target member's row
    const memberRow = page.locator(`[data-community-member-id="${memberUserId}"]`)
    await expect(memberRow).toBeVisible()

    // Open the mod notes popover
    const trigger = memberRow.getByTestId('user-mod-notes-trigger')
    await expect(trigger).toBeVisible()
    await trigger.click()

    await expect(page.getByTestId('user-mod-notes-panel')).toBeVisible()

    const noteBody = `Owner note ${suffix}`
    await page.getByTestId('mod-note-body').pressSequentially(noteBody)
    await page.getByTestId('mod-note-submit').click()

    await expect(page.getByTestId('mod-note-item').filter({ hasText: noteBody })).toBeVisible()
  })
})

test.describe('Community Mod Notes — Community Moderator', () => {
  test('moderator can add a community-scoped mod note on the members page', async ({ page }) => {
    await loginAsUser(page, moderatorUserId)
    await navigateTo(page, `/communities/${communitySlug}/members`)

    const memberRow = page.locator(`[data-community-member-id="${memberUserId}"]`)
    await expect(memberRow).toBeVisible()

    const trigger = memberRow.getByTestId('user-mod-notes-trigger')
    await expect(trigger).toBeVisible()
    await trigger.click()

    await expect(page.getByTestId('user-mod-notes-panel')).toBeVisible()

    const noteBody = `Moderator note ${suffix}`
    await page.getByTestId('mod-note-body').pressSequentially(noteBody)
    await page.getByTestId('mod-note-submit').click()

    await expect(page.getByTestId('mod-note-item').filter({ hasText: noteBody })).toBeVisible()
  })
})
