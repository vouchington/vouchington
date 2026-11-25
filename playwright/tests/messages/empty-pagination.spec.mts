import {
  createTestDirectConversation,
  createTestUser,
} from '../../../backend/test-helpers/index.mts'
import { loginAsUser } from '../../helpers/auth.mts'
import { test, expect } from '../../helpers/test.mts'
import { navigateTo, randomSuffix } from 'vouchington-tooling/playwright'

test('continues an empty inbox automatically and pauses after five empty pages', async ({
  page,
}) => {
  const suffix = randomSuffix()
  const viewer = await createTestUser({ username: `dm-empty-${suffix}` })
  const partnerUsername = `dm-partner-${suffix}`
  const partner = await createTestUser({ username: partnerUsername })
  await loginAsUser(page, viewer.id)

  const endpoint = '/api/v1/my/messages'
  const sidebarFirstPage = page.waitForResponse(
    response => new URL(response.url()).pathname === endpoint && response.ok(),
  )
  await navigateTo(page, '/messages')
  const inbox = page.getByTestId('messages-inbox')
  const emptyState = inbox.getByText('No messages yet.', { exact: true })
  await expect(emptyState).toBeVisible()
  await sidebarFirstPage

  await createTestDirectConversation({ user1Id: viewer.id, user2Id: partner.id })

  // Reproduce bounded empty pages on the inbox's focus refresh. The final page comes
  // from the real endpoint so the manual continuation must render a real conversation.
  const requestedCursors: Array<string | null> = []
  await page.route(
    url => url.pathname === endpoint,
    async route => {
      const url = new URL(route.request().url())
      const after = url.searchParams.get('after')
      requestedCursors.push(after)
      if (after === 'empty-5') {
        url.searchParams.delete('after')
        await route.fulfill({ response: await route.fetch({ url: url.href }) })
        return
      }
      const pageNumber = after === null ? 1 : Number(after.slice('empty-'.length)) + 1
      await route.fulfill({
        json: {
          results: [],
          page_info: { has_next_page: true, start_cursor: null, end_cursor: `empty-${pageNumber}` },
        },
      })
    },
  )
  const fifthPage = page.waitForResponse(response => {
    const url = new URL(response.url())
    return url.pathname === endpoint && url.searchParams.get('after') === 'empty-4'
  })
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await fifthPage

  const loadMore = inbox.getByRole('button', { name: 'Load more', exact: true })
  await expect(loadMore).toBeEnabled()
  await expect(emptyState).toBeHidden()
  const sentinel = inbox.getByTestId('infinite-scroll-sentinel')
  // Let the browser process the visible sentinel after the last automatic page renders.
  await sentinel.evaluate(
    element =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          const observer = new IntersectionObserver(([entry]) => {
            if (!entry?.isIntersecting) return
            observer.disconnect()
            requestAnimationFrame(() => resolve())
          })
          observer.observe(element)
        })
      }),
  )
  expect(requestedCursors).toStrictEqual([null, 'empty-1', 'empty-2', 'empty-3', 'empty-4'])

  await loadMore.click()
  await expect(inbox.getByRole('link', { name: partnerUsername })).toBeVisible()
  await expect(loadMore).toBeHidden()
  expect(requestedCursors).toStrictEqual([
    null,
    'empty-1',
    'empty-2',
    'empty-3',
    'empty-4',
    'empty-5',
  ])
})
