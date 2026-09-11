import { test, expect } from '../../helpers/test.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { requireTestValue } from '../../helpers/assertions.mts'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  insertTestModerationReport,
  createTestModmailThread,
} from '../../../backend/test-helpers/index.mts'

let ownerUserId = ''
let staffUserId = ''
let memberUserId = ''
let communitySlug = ''
let communityId = ''
let threadId = ''
let sendThreadId = ''
let resolveThreadId = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()

  const owner = requireTestValue(
    await createTestUser({ username: `modmail-owner-${suffix}` }),
    'Failed to create owner user',
  )
  ownerUserId = owner.id

  const staff = requireTestValue(
    await createTestUser({ username: `modmail-staff-${suffix}`, administrator: true }),
    'Failed to create staff user',
  )
  staffUserId = staff.id

  const member = requireTestValue(
    await createTestUser({ username: `modmail-member-${suffix}` }),
    'Failed to create member user',
  )
  memberUserId = member.id

  // Separate subjects for send/resolve threads — unique index allows only one open thread per
  // (community_id, subject_user_id) pair.
  const sendMember = requireTestValue(
    await createTestUser({ username: `modmail-send-${suffix}` }),
    'Failed to create sendMember user',
  )

  const resolveMember = requireTestValue(
    await createTestUser({ username: `modmail-resolve-${suffix}` }),
    'Failed to create resolveMember user',
  )

  communitySlug = `modmail-test-${suffix}`
  const community = await insertTestCommunity({
    createdById: owner.id,
    slug: communitySlug,
    name: `Modmail Test ${suffix}`,
  })
  communityId = community.id

  await insertTestCommunityMember({ communityId, userId: owner.id, role: 'owner' })
  await insertTestCommunityMember({ communityId, userId: staff.id, role: 'moderator' })
  await insertTestCommunityMember({ communityId, userId: member.id, role: 'member' })

  const postId = await insertTestPost({
    createdById: member.id,
    communityId,
    slug: `modmail-post-${suffix}`,
    title: `Modmail Post ${suffix}`,
    markdown: 'test post',
  })

  await insertTestModerationReport({
    reporterUserId: owner.id,
    entityType: 'post',
    entityId: postId,
  })

  const thread = await createTestModmailThread({
    communityId,
    subjectUserId: member.id,
    modUserId: owner.id,
  })
  threadId = thread.id

  const sendThread = await createTestModmailThread({
    communityId,
    subjectUserId: sendMember.id,
    modUserId: owner.id,
  })
  sendThreadId = sendThread.id

  const resolveThread = await createTestModmailThread({
    communityId,
    subjectUserId: resolveMember.id,
    modUserId: owner.id,
  })
  resolveThreadId = resolveThread.id
})

test.describe('Modmail — member side', () => {
  test('member sees "Message Mods" button on community page', async ({ page }) => {
    await loginAsUser(page, memberUserId)
    await navigateTo(page, `/communities/${communitySlug}`)

    await expect(page.getByTestId('message-mods-button')).toBeVisible()
  })

  test('member can view modmail thread at member-facing URL', async ({ page }) => {
    await loginAsUser(page, memberUserId)
    await navigateTo(page, `/messages/modmail/${communitySlug}/${threadId}`)

    await expect(page.getByTestId('modmail-thread-view')).toBeVisible()
    await expect(page.getByTestId('modmail-thread-messages')).toBeVisible()
    await expect(page.getByTestId('modmail-compose-input')).toBeVisible()
    await expect(page.getByTestId('modmail-resolve-button')).toBeHidden()
  })

  test('mod does not see "Message Mods" button', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}`)

    await expect(page.getByTestId('message-mods-button')).toBeHidden()
  })
})

test.describe('Modmail — mod side', () => {
  test('mod sees modmail inbox and thread item in settings', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await expect(page.getByTestId('modmail-inbox')).toBeVisible()
    await expect(page.getByTestId('modmail-inbox-item').first()).toBeVisible()
  })

  test('mod can open modmail thread view', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation/modmail/${threadId}`)

    await expect(page.getByTestId('modmail-thread-view')).toBeVisible()
    await expect(page.getByTestId('modmail-thread-messages')).toBeVisible()
    await expect(page.getByTestId('modmail-compose-input')).toBeVisible()
    await expect(page.getByTestId('modmail-back-link')).toBeVisible()
  })

  test('mod can send a message in a modmail thread', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(
      page,
      `/communities/${communitySlug}/settings/moderation/modmail/${sendThreadId}`,
    )

    await page.getByTestId('modmail-compose-input').pressSequentially('Hello from mod')
    await expect(page.getByTestId('modmail-send-button')).toBeEnabled()
    const responsePromise = page.waitForResponse(
      res =>
        res.url().includes('/modmail/') && res.url().includes('/messages') && res.status() === 201,
    )
    await page.getByTestId('modmail-send-button').click()
    await responsePromise
  })

  test('mod can resolve a modmail thread', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(
      page,
      `/communities/${communitySlug}/settings/moderation/modmail/${resolveThreadId}`,
    )

    await expect(page.getByTestId('modmail-resolve-button')).toBeVisible()
    const responsePromise = page.waitForResponse(
      res => res.url().includes('/modmail/') && res.status() === 200,
    )
    await page.getByTestId('modmail-resolve-button').click()
    await responsePromise
    await expect(page.getByTestId('modmail-resolve-button')).toBeHidden()
  })

  test('send-modmail button is visible for site staff', async ({ page }) => {
    await loginAsUser(page, staffUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await expect(page.getByTestId('send-modmail-button')).toBeVisible()
  })

  test('send-modmail button is not visible for community-only moderators', async ({ page }) => {
    await loginAsUser(page, ownerUserId)
    await navigateTo(page, `/communities/${communitySlug}/settings/moderation`)

    await expect(page.getByTestId('send-modmail-button')).toBeHidden()
  })
})

test.describe('Modmail inbox pagination', () => {
  let paginatedOwnerUserId = ''
  let paginatedCommunitySlug = ''

  test.beforeAll(async () => {
    const suffix = randomSuffix()
    const owner = requireTestValue(
      await createTestUser({ username: `modmail-pager-${suffix}` }),
      'Failed to create owner user',
    )
    paginatedOwnerUserId = owner.id

    paginatedCommunitySlug = `modmail-paged-${suffix}`
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: paginatedCommunitySlug,
      name: `Modmail Paged ${suffix}`,
    })

    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })

    const subjectUsers = await Promise.all(
      Array.from({ length: 51 }, (_, i) => createTestUser({ username: `mm-subj-${i}-${suffix}` })),
    )

    await Promise.all(
      subjectUsers.map(subject =>
        createTestModmailThread({
          communityId: community.id,
          subjectUserId: requireTestValue(subject, 'Failed to create subject user').id,
          modUserId: owner.id,
        }),
      ),
    )
  })

  test('paginates modmail inbox threads', async ({ page }) => {
    await loginAsUser(page, paginatedOwnerUserId)
    await navigateTo(page, `/communities/${paginatedCommunitySlug}/settings/moderation`)
    const inbox = page.getByTestId('modmail-inbox')
    const inboxItems = inbox.getByTestId('modmail-inbox-item')
    const continuation = inbox.getByTestId('paginated-list-continuation')
    await expect(inboxItems).toHaveCount(50)
    await expect(continuation.getByRole('button')).toBeVisible()
    await continuation.getByRole('button').click()
    await expect(inboxItems).toHaveCount(51)
    await expect(continuation).toHaveCount(0)
  })
})
