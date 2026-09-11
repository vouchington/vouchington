import { test, expect } from '../../helpers/test.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import {
  createTestUser,
  createTestDirectConversation,
  createTestDirectMessage,
} from '../../../backend/test-helpers/index.mts'

let user1Id = ''
let user2Id = ''
let conversationId = ''
let paginatedConversationId = ''

test.beforeAll(async () => {
  const suffix = randomSuffix()

  const user1 = await createTestUser({ username: `dm-user1-${suffix}` })
  if (!user1) throw new Error('Failed to create user1')
  user1Id = user1.id

  const user2 = await createTestUser({ username: `dm-user2-${suffix}` })
  if (!user2) throw new Error('Failed to create user2')
  user2Id = user2.id

  const conversation = await createTestDirectConversation({ user1Id, user2Id })
  conversationId = conversation.id

  await createTestDirectMessage({
    conversationId,
    createdById: user2Id,
    bodyText: `Hello from user2 ${suffix}`,
  })

  // Create a conversation with 51 messages to trigger the load-more button
  const paginatedConv = await createTestDirectConversation({ user1Id, user2Id })
  paginatedConversationId = paginatedConv.id
  await Promise.all(
    Array.from({ length: 51 }, (_, i) =>
      createTestDirectMessage({
        conversationId: paginatedConversationId,
        createdById: user2Id,
        bodyText: `Message ${i + 1} of 51`,
      }),
    ),
  )
})

test.describe('Direct Messages inbox', () => {
  test('shows the inbox page and conversation item', async ({ page }) => {
    await loginAsUser(page, user1Id)
    await navigateTo(page, '/messages')

    await expect(page.getByTestId('messages-inbox')).toBeVisible()
    await expect(page.getByTestId('messages-inbox-item').first()).toBeVisible()
  })

  test('shows messages sidebar group with All Messages link and conversation link', async ({
    page,
  }) => {
    await loginAsUser(page, user1Id)
    await navigateTo(page, '/messages')

    await expect(page.getByTestId('messages-sidebar-group')).toBeVisible()
    await expect(page.getByTestId('messages-all-link')).toBeVisible()
    await expect(page.getByTestId('messages-conversation-link').first()).toBeVisible()
  })

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.context().clearCookies()
    await navigateTo(page, '/messages')
    await expect(page).toHaveURL('/login')
  })
})

test.describe('Direct Messages thread', () => {
  test('shows thread, compose input, and send button', async ({ page }) => {
    await loginAsUser(page, user1Id)
    await navigateTo(page, `/messages/${conversationId}`)

    await expect(page.getByTestId('dm-thread-messages')).toBeVisible()
    await expect(page.getByTestId('dm-compose-input')).toBeVisible()
    await expect(page.getByTestId('dm-send-button')).toBeVisible()
  })

  test('shows load-more button when thread has more than one page of messages', async ({
    page,
  }) => {
    await loginAsUser(page, user1Id)
    await navigateTo(page, `/messages/${paginatedConversationId}`)

    await expect(page.getByTestId('dm-load-more-button')).toBeVisible()
    await page.getByTestId('dm-load-more-button').click()
    await expect(page.getByTestId('dm-load-more-button')).toBeHidden()
  })
})

test.describe('Direct Messages inbox pagination', () => {
  let paginatedInboxUserId = ''

  test.beforeAll(async () => {
    const suffix = randomSuffix()
    const inboxUser = await createTestUser({ username: `dm-inbox-pager-${suffix}` })
    if (!inboxUser) throw new Error('Failed to create inbox pagination user')
    paginatedInboxUserId = inboxUser.id

    const partnerUsers = await Promise.all(
      Array.from({ length: 51 }, (_, i) => createTestUser({ username: `dm-ptnr-${i}-${suffix}` })),
    )

    await Promise.all(
      partnerUsers.map(partner => {
        if (!partner) throw new Error('Failed to create partner user')
        return createTestDirectConversation({
          user1Id: paginatedInboxUserId,
          user2Id: partner.id,
        })
      }),
    )
  })

  test('shows load-more button when inbox has more than one page of conversations', async ({
    page,
  }) => {
    await loginAsUser(page, paginatedInboxUserId)
    await navigateTo(page, '/messages')

    const inbox = page.getByTestId('messages-inbox')
    const continuation = inbox.getByTestId('paginated-list-continuation')
    const loadMore = continuation.getByRole('button', { name: 'Load more' })
    await expect(loadMore).toBeVisible()
    await loadMore.click()
    await expect(inbox.getByTestId('messages-inbox-item')).toHaveCount(51)
    await expect(continuation).toBeHidden()
  })

  test('shows sidebar load-more button when user has more than one page of conversations', async ({
    page,
  }) => {
    await loginAsUser(page, paginatedInboxUserId)
    await navigateTo(page, '/messages')

    const sidebar = page.getByTestId('sidebar-peer')
    const continuation = sidebar.getByTestId('paginated-list-continuation')
    await expect(continuation.getByRole('button', { name: 'Load more' })).toBeVisible()
  })
})

test.describe('Direct Messages privacy setting', () => {
  test.use({ storageState: AUTH_STATE })

  test('privacy page shows direct-messages-audience select', async ({ page }) => {
    await navigateTo(page, '/my/privacy')

    await expect(page.getByTestId('direct-messages-audience-select')).toBeVisible()
  })

  test('can update direct-messages-audience preference', async ({ page }) => {
    await navigateTo(page, '/my/privacy')

    await page.getByTestId('direct-messages-audience-select').click()
    await page.getByTestId('direct-messages-audience-option-nobody').click()
    await expect(page.getByTestId('direct-messages-audience-select')).toContainText('Nobody')

    // Reset back to everyone so the AUTH_STATE session is clean for other tests
    await page.getByTestId('direct-messages-audience-select').click()
    await page.getByTestId('direct-messages-audience-option-everyone').click()
    await expect(page.getByTestId('direct-messages-audience-select')).toContainText('Everyone')
  })
})
