import { expect, test } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityBan,
  insertTestPost,
  insertTestCommunityPostReview,
  updateTestCommunityPostReviewState,
} from '../../../backend/test-helpers/index.mts'

// --- ban appeal fixture ---
let bannedUserId = ''
let banCommunitySlug = ''

// --- removed-post appeal fixture ---
let removedPostUserId = ''
let removalCommunitySlug = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()

  // Ban fixture
  const banOwner = await createTestUser({ username: `mas-ban-owner-${suffix}` })
  if (!banOwner) throw new Error('Failed to create ban owner')

  const bannedUser = await createTestUser({ username: `mas-banned-user-${suffix}` })
  if (!bannedUser) throw new Error('Failed to create banned user')
  bannedUserId = bannedUser.id

  banCommunitySlug = `mas-ban-test-${suffix}`
  const banCommunity = await insertTestCommunity({
    createdById: banOwner.id,
    slug: banCommunitySlug,
    name: `MAS Ban Test ${suffix}`,
    visibility: 'public',
  })

  await insertTestCommunityMember({
    communityId: banCommunity.id,
    userId: banOwner.id,
    role: 'owner',
  })
  await insertTestCommunityMember({
    communityId: banCommunity.id,
    userId: bannedUser.id,
    role: 'member',
  })
  await insertTestCommunityBan({
    communityId: banCommunity.id,
    userId: bannedUser.id,
    bannedById: banOwner.id,
    reason: `E2E ban reason ${suffix}`,
  })

  // Removed-post fixture
  const removalOwner = await createTestUser({ username: `mas-rem-owner-${suffix}` })
  if (!removalOwner) throw new Error('Failed to create removal owner')

  const removedUser = await createTestUser({ username: `mas-rem-user-${suffix}` })
  if (!removedUser) throw new Error('Failed to create removed-post user')
  removedPostUserId = removedUser.id

  removalCommunitySlug = `mas-rem-test-${suffix}`
  const removalCommunity = await insertTestCommunity({
    createdById: removalOwner.id,
    slug: removalCommunitySlug,
    name: `MAS Removal Test ${suffix}`,
    visibility: 'public',
  })

  await insertTestCommunityMember({
    communityId: removalCommunity.id,
    userId: removalOwner.id,
    role: 'owner',
  })
  await insertTestCommunityMember({
    communityId: removalCommunity.id,
    userId: removedUser.id,
    role: 'member',
  })

  const removedPostId = await insertTestPost({
    title: `Removed post for appeal ${suffix}`,
    slug: `mas-removed-post-${suffix}`,
    createdById: removedUser.id,
    markdown: 'Post that will be removed from the community.',
    communityId: removalCommunity.id,
  })

  await insertTestCommunityPostReview({
    communityId: removalCommunity.id,
    postId: removedPostId,
    submittedById: removedUser.id,
  })

  await updateTestCommunityPostReviewState({
    communityId: removalCommunity.id,
    postId: removedPostId,
    unpublishedAt: new Date(),
  })
})

test.describe('/my/bans — appeal filing', () => {
  test('member can file an appeal for a community ban', async ({ page }) => {
    await loginAsUser(page, bannedUserId)
    await navigateTo(page, '/my/bans')

    await expect(page.getByTestId('my-bans-list')).toBeVisible()

    // Open the appeal dialog
    await page.getByTestId('appeal-dialog-trigger').first().click()
    await expect(page.getByTestId('appeal-form')).toBeVisible()

    // Select a reason
    await page.getByRole('combobox').click()
    await page.getByRole('listbox').getByTestId('appeal-reason-option-incorrect_facts').click()
    await expect(page.getByRole('listbox')).toBeHidden()

    // Fill in the appeal statement; click first to ensure textarea focus after Radix closes.
    const statement = page.getByRole('textbox', { name: 'Statement' })
    await statement.click()
    await statement.pressSequentially('I was not violating the community rules when I was banned.')

    // Wait for Turnstile stub token, then submit via keyboard shortcut.
    await expect(page.getByTestId('appeal-submit-button')).toBeEnabled()
    await statement.press('ControlOrMeta+Enter')

    // Dialog closes on success.
    await expect(page.getByTestId('appeal-form')).toBeHidden()
  })
})

test.describe('/my/removed-posts — appeal filing', () => {
  test('member can file an appeal for a removed post', async ({ page }) => {
    await loginAsUser(page, removedPostUserId)
    await navigateTo(page, '/my/removed-posts')

    await expect(page.getByTestId('my-removed-posts-list')).toBeVisible()

    // Open the appeal dialog
    await page.getByTestId('appeal-dialog-trigger').first().click()
    await expect(page.getByTestId('appeal-form')).toBeVisible()

    // Select a reason
    await page.getByRole('combobox').click()
    await page.getByRole('listbox').getByTestId('appeal-reason-option-context_missing').click()
    await expect(page.getByRole('listbox')).toBeHidden()

    // Fill in the appeal statement; click first to ensure textarea focus after Radix closes.
    const statement = page.getByRole('textbox', { name: 'Statement' })
    await statement.click()
    await statement.pressSequentially(
      'My post was removed without sufficient context being considered.',
    )

    // Wait for Turnstile stub token, then submit via keyboard shortcut.
    await expect(page.getByTestId('appeal-submit-button')).toBeEnabled()
    await statement.press('ControlOrMeta+Enter')

    // Dialog closes on success.
    await expect(page.getByTestId('appeal-form')).toBeHidden()
  })
})
