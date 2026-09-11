import { expect } from '../../helpers/test.mts'
import {
  navigateToTagVotingDiscussion,
  tagClearButton,
  tagConfirmButton,
  tagDisputeButton,
  test,
  waitForVoteButtonHydration,
} from './tag-voting-helpers.mts'

test.describe('Tag Voting', () => {
  test('Confirm changes selected state when clicked', async ({ page, tagVotingDiscussionIds }) => {
    await navigateToTagVotingDiscussion(page, tagVotingDiscussionIds)
    await page.setViewportSize({ width: 1280, height: 720 })
    await waitForVoteButtonHydration(page)

    const confirmButton = tagConfirmButton(page)
    await expect(confirmButton).toHaveAttribute('aria-pressed', 'false')
    await confirmButton.click()
    await expect(confirmButton).toHaveAttribute('aria-pressed', 'true')
  })

  test('Dispute changes selected state when clicked', async ({ page, tagVotingDiscussionIds }) => {
    await navigateToTagVotingDiscussion(page, tagVotingDiscussionIds)
    await page.setViewportSize({ width: 1280, height: 720 })
    await waitForVoteButtonHydration(page)

    const disputeButton = tagDisputeButton(page)
    await expect(disputeButton).toHaveAttribute('aria-pressed', 'false')
    await disputeButton.click()
    await expect(disputeButton).toHaveAttribute('aria-pressed', 'true')
  })

  test('public viewers cannot Clear a Confirm vote', async ({ page, tagVotingDiscussionIds }) => {
    await navigateToTagVotingDiscussion(page, tagVotingDiscussionIds)
    await page.setViewportSize({ width: 1280, height: 720 })
    await waitForVoteButtonHydration(page)

    const confirmButton = tagConfirmButton(page)
    await confirmButton.click()
    await expect(confirmButton).toHaveAttribute('aria-pressed', 'true')
    await expect(tagClearButton(page)).toHaveCount(0)
    await expect(confirmButton).toHaveAttribute('aria-pressed', 'true')
  })

  test('switching from Confirm to Dispute changes state', async ({
    page,
    tagVotingDiscussionIds,
  }) => {
    await navigateToTagVotingDiscussion(page, tagVotingDiscussionIds)
    await page.setViewportSize({ width: 1280, height: 720 })
    await waitForVoteButtonHydration(page)

    const confirmButton = tagConfirmButton(page)
    const disputeButton = tagDisputeButton(page)

    await confirmButton.click()
    await expect(confirmButton).toHaveAttribute('aria-pressed', 'true')
    await disputeButton.click()
    await expect(disputeButton).toHaveAttribute('aria-pressed', 'true')
    await expect(confirmButton).toHaveAttribute('aria-pressed', 'false')
  })

  test('voting buttons hidden when not logged in', async ({ page, tagVotingDiscussionIds }) => {
    await navigateToTagVotingDiscussion(page, tagVotingDiscussionIds, { authenticated: false })
    await page.setViewportSize({ width: 1280, height: 720 })

    await expect(tagConfirmButton(page)).toHaveCount(0)
    await expect(tagDisputeButton(page)).toHaveCount(0)
  })

  test('voting works on tag management page', async ({ page, tagVotingDiscussionIds }) => {
    await navigateToTagVotingDiscussion(page, tagVotingDiscussionIds, { manage: true })
    await waitForVoteButtonHydration(page)

    // Vote on a tag
    const confirmButton = tagConfirmButton(page)
    await confirmButton.click()

    // Button should be highlighted
    await expect(confirmButton).toHaveAttribute('aria-pressed', 'true')
  })

  test('optimistic update reverts on API error', async ({ page, tagVotingDiscussionIds }) => {
    await navigateToTagVotingDiscussion(page, tagVotingDiscussionIds)
    await page.setViewportSize({ width: 1280, height: 720 })
    await waitForVoteButtonHydration(page)

    // Hold the failed vote request open long enough to observe the optimistic state.
    let failVoteRequest!: () => void
    const voteRequestFailed = page.waitForEvent(
      'requestfailed',
      request =>
        request.url().includes('/api/v1/entity-relations/') && request.url().includes('/vote'),
    )
    await page.route('**/api/v1/entity-relations/*/vote', async route => {
      await new Promise<void>(resolve => {
        failVoteRequest = resolve
      })
      await route.abort('aborted')
    })

    const confirmButton = tagConfirmButton(page)

    await confirmButton.click()

    // Button should first be highlighted optimistically
    await expect(confirmButton).toHaveAttribute('aria-pressed', 'true')

    failVoteRequest()
    await voteRequestFailed

    // Button should not be highlighted (optimistic update reverted)
    await expect(confirmButton).toHaveAttribute('aria-pressed', 'false')
  })

  test('vote persists after page refresh', async ({ page, tagVotingDiscussionIds }) => {
    await navigateToTagVotingDiscussion(page, tagVotingDiscussionIds)
    await page.setViewportSize({ width: 1280, height: 720 })
    await waitForVoteButtonHydration(page)

    const confirmButton = tagConfirmButton(page)
    const voteResponse = page.waitForResponse(
      resp => resp.url().includes('/api/v1/entity-relations/') && resp.url().includes('/vote'),
    )
    await confirmButton.click()
    await voteResponse
    await expect(confirmButton).toHaveAttribute('aria-pressed', 'true')

    // Refresh page
    await page.reload()
    await page.setViewportSize({ width: 1280, height: 720 })
    await waitForVoteButtonHydration(page)

    // Vote should still be active (button highlighted)
    const confirmButtonAfterRefresh = tagConfirmButton(page)
    await expect(confirmButtonAfterRefresh).toHaveAttribute('aria-pressed', 'true')
  })

  test('buttons are enabled and clickable when logged in', async ({
    page,
    tagVotingDiscussionIds,
  }) => {
    await navigateToTagVotingDiscussion(page, tagVotingDiscussionIds)
    await page.setViewportSize({ width: 1280, height: 720 })
    await waitForVoteButtonHydration(page)

    const confirmButton = tagConfirmButton(page)
    const disputeButton = tagDisputeButton(page)

    // Buttons should be visible and enabled
    await expect(confirmButton).toBeVisible()
    await expect(confirmButton).toBeEnabled()
    await expect(disputeButton).toBeVisible()
    await expect(disputeButton).toBeEnabled()

    // Should be clickable
    await expect(confirmButton).not.toHaveAttribute('disabled')
    await expect(disputeButton).not.toHaveAttribute('disabled')
  })
})
