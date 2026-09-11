import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { randomSuffix } from '../../helpers/random-id.mts'
import { waitForBelowFoldHydration } from '../../helpers/wait-for-hydration.mts'
import { chooseVote, voteBinaryChoice } from '../../helpers/semantic-vote.mts'
import {
  createTestAgent,
  createTestUser,
  insertTestAgentModeration,
  insertTestAgentPrompt,
  insertTestPost,
  mockAiGeneratedModerationResults,
} from '../../../backend/test-helpers/index.mts'

// Uses seed data:
// - Discussion post '019c64e6-f720-7001-a001-000000000001' with non-flagged moderation
// - Review post '019c64e6-f720-7002-a002-000000000001' with flagged moderation
// - Comment A '019c64e6-f730-7001-8001-000000000001' with non-flagged moderation
const DISCUSSION_ID = '019c64e6-f720-7001-a001-000000000001'
let votingDiscussionId = ''
let votingCommentBody = ''
let aiGeneratedDiscussionId = ''
let aiGeneratedCommentBody = ''

test.beforeAll(async () => {
  const random = randomSuffix()
  const author = await createTestUser({ username: `admin-mod-${random}` })
  if (!author) throw new Error('Failed to create author for admin moderation test')

  votingDiscussionId = await insertTestPost({
    title: `Admin moderation voting ${random}`,
    slug: `admin-moderation-voting-${random}`,
    createdById: author.id,
    markdown: 'Admin moderation voting root post',
  })
  votingCommentBody = `Admin moderation voting comment ${random}`
  const commentId = await insertTestPost({
    title: '',
    slug: `admin-moderation-comment-${random}`,
    createdById: author.id,
    markdown: votingCommentBody,
    postType: 'comment',
    rootId: votingDiscussionId,
    parentId: votingDiscussionId,
  })
  const agent = await createTestAgent({
    agentType: 'moderator',
    activated: true,
    slug: `admin-moderation-${random}`,
  })
  const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
  await insertTestAgentModeration({
    postId: commentId,
    promptId,
    agentId: agent.id,
    results: { flagged: false, reason: 'Ephemeral moderation result' },
    flagged: false,
  })

  aiGeneratedDiscussionId = await insertTestPost({
    title: `Admin moderation ai generated ${random}`,
    slug: `admin-moderation-ai-generated-${random}`,
    createdById: author.id,
    markdown: 'Admin moderation root post for AI generated results',
  })
  aiGeneratedCommentBody = `Admin moderation ai generated comment ${random}`
  const aiGeneratedCommentId = await insertTestPost({
    title: '',
    slug: `admin-moderation-ai-generated-comment-${random}`,
    createdById: author.id,
    markdown: aiGeneratedCommentBody,
    postType: 'comment',
    rootId: aiGeneratedDiscussionId,
    parentId: aiGeneratedDiscussionId,
  })
  const aiGeneratedAgent = await createTestAgent({
    agentType: 'moderator',
    activated: true,
    slug: `ai-generated-${random}`,
  })
  const aiGeneratedPromptId = await insertTestAgentPrompt({
    agentId: aiGeneratedAgent.id,
    activated: true,
  })
  await insertTestAgentModeration({
    postId: aiGeneratedCommentId,
    promptId: aiGeneratedPromptId,
    agentId: aiGeneratedAgent.id,
    results: mockAiGeneratedModerationResults,
    flagged: true,
  })
})

test.describe('Admin Moderation', () => {
  test.use({ storageState: AUTH_STATE })

  test('admin sees moderation button on comment in discussion detail page', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

    // Wait for Comment A to be visible
    await expect(
      page
        .getByTestId('comment-node-content')
        .filter({ hasText: 'This is Comment A - a top-level comment' }),
    ).toBeVisible()

    // Moderation button should be visible on Comment A (non-flagged → "Moderation" label)
    await expect(page.getByTestId('admin-moderation-trigger').first()).toBeVisible()
  })

  test('unauthenticated user does not see moderation button on discussion detail page', async ({
    page,
  }) => {
    // Unauthenticated user should not see moderation button
    await page.context().clearCookies()
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

    // Wait for comments to load
    await expect(
      page
        .getByTestId('comment-node-content')
        .filter({ hasText: 'This is Comment A - a top-level comment' }),
    ).toBeVisible()

    // Moderation button should not be present for non-admins
    await expect(page.getByTestId('admin-moderation-trigger')).toHaveCount(0)
    await expect(page.getByTestId('admin-moderation-flagged-trigger')).toHaveCount(0)
  })

  test('admin can open moderation dialog to see results', async ({ page }) => {
    await navigateTo(page, `/discussion/${DISCUSSION_ID}`)

    // Wait for Comment A and its moderation button
    await expect(
      page
        .getByTestId('comment-node-content')
        .filter({ hasText: 'This is Comment A - a top-level comment' }),
    ).toBeVisible()
    const moderationButton = page.getByTestId('admin-moderation-trigger').first()
    await expect(moderationButton).toBeVisible()
    await moderationButton.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)

    await moderationButton.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByTestId('moderation-results-title')).toBeVisible()
    await expect(
      dialog.getByTestId('moderation-reason').filter({ hasText: 'Normal comment' }),
    ).toBeVisible()
  })

  test('admin can vote on an ephemeral moderation result', async ({ page }) => {
    await navigateTo(page, `/discussion/${votingDiscussionId}`)

    await expect(
      page.getByTestId('comment-node-content').filter({ hasText: votingCommentBody }),
    ).toBeVisible()

    const moderationButton = page.getByTestId('admin-moderation-trigger').first()
    await moderationButton.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await moderationButton.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByTestId('moderation-results-title')).toBeVisible()

    const goodButton = voteBinaryChoice(dialog, 'score-vote', 'accurate').first()
    await chooseVote(dialog, 'score-vote', 'accurate')

    await expect(goodButton).toHaveAttribute('aria-pressed', 'true')
  })

  test('admin sees saved confidence metadata for AI-generated moderation results', async ({
    page,
  }) => {
    await navigateTo(page, `/discussion/${aiGeneratedDiscussionId}`)

    await expect(
      page.getByTestId('comment-node-content').filter({ hasText: aiGeneratedCommentBody }),
    ).toBeVisible()

    const moderationButton = page.getByTestId('admin-moderation-flagged-trigger').first()
    await moderationButton.scrollIntoViewIfNeeded()
    await waitForBelowFoldHydration(page)
    await moderationButton.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByTestId('moderation-results-title')).toBeVisible()
    await expect(
      dialog.getByTestId('moderation-reason').filter({ hasText: 'Detected as AI-generated' }),
    ).toBeVisible()
    await expect(
      dialog
        .getByTestId('moderation-confidence')
        .filter({ hasText: 'Confidence 99.1% vs threshold 95.0% via is-it-slop' }),
    ).toBeVisible()
  })
})
