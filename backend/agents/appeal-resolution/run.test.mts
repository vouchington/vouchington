import { randomUUID } from 'node:crypto'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestUserWarning,
  insertTestCommunity,
  insertTestCommunityBan,
  insertTestPost,
  insertTestCommunityPostReview,
  updateTestCommunityPostReviewState,
  markPostFlaggedForModeration,
  suspendTestUserGetId,
} from '@voucha/test-helpers'
import { createModerationAppeal } from '@services/moderation-appeals/create'
import { getModerationAppealById } from '@services/moderation-appeals/get'
import { parseCreateModerationAppealInput } from '@services/moderation-appeals/parse'
import { runAppealResolutionAgent } from './run.mts'
import type { PrivateUser } from '@services/users/types'

function makeModelCaller(json: object) {
  return vi.fn<(input: string, safetyId: string) => Promise<unknown>>(() =>
    Promise.resolve({
      id: `resp-${randomUUID()}`,
      output: [
        {
          type: 'message',
          status: 'completed',
          content: [{ type: 'output_text', text: JSON.stringify(json) }],
        },
      ],
    }),
  )
}

describe('runAppealResolutionAgent', () => {
  let staff: PrivateUser
  let appellant: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
    appellant = await createTestUser()
  })

  async function makeWarningAndAppeal() {
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: `Agent test reason ${randomUUID().slice(0, 8)}`,
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: `Appeal reason ${randomUUID()}`,
    })
    const { appeal } = await createModerationAppeal(appellant, input)
    return appeal
  }

  it('is a no-op when appeal does not exist', async () => {
    const callModel = makeModelCaller({
      recommended_action: 'deny',
      public_response: 'x',
      internal_response: 'x',
    })
    await runAppealResolutionAgent({ appealId: randomUUID() }, callModel)
    expect(callModel).not.toHaveBeenCalled()
  })

  it('is a no-op when ai_drafted_at is already set (non-rerun idempotency)', async () => {
    const appeal = await makeWarningAndAppeal()

    const firstCaller = makeModelCaller({
      recommended_action: 'deny',
      public_response: 'First run.',
      internal_response: 'Internal.',
    })
    await runAppealResolutionAgent({ appealId: appeal.id }, firstCaller)
    expect(firstCaller).toHaveBeenCalledOnce()

    const secondCaller = makeModelCaller({
      recommended_action: 'accept',
      public_response: 'Second run.',
      internal_response: 'Internal.',
    })
    await runAppealResolutionAgent({ appealId: appeal.id }, secondCaller)
    expect(secondCaller).not.toHaveBeenCalled()
  })

  it('calls createModerationAppealDraft with the correct shape for a fresh appeal', async () => {
    const appeal = await makeWarningAndAppeal()

    const callModel = makeModelCaller({
      recommended_action: 'accept',
      public_response: 'We have reviewed your appeal and decided to accept it.',
      internal_response: 'Moderation action was not justified.',
    })

    await runAppealResolutionAgent({ appealId: appeal.id }, callModel)

    expect(callModel).toHaveBeenCalledOnce()
    const updated = await getModerationAppealById(appeal.id)
    expect(updated!.ai_drafted_at).not.toBeNull()
    expect(updated!.recommended_action).toBe('accept')
    expect(updated!.ai_public_response).toBe(
      'We have reviewed your appeal and decided to accept it.',
    )
  })

  it('reruns when rerunById is set (bypasses idempotency)', async () => {
    const appeal = await makeWarningAndAppeal()

    const firstCaller = makeModelCaller({
      recommended_action: 'deny',
      public_response: 'First.',
      internal_response: 'First.',
    })
    await runAppealResolutionAgent({ appealId: appeal.id }, firstCaller)

    const secondCaller = makeModelCaller({
      recommended_action: 'reduce',
      public_response: 'Rerun response.',
      internal_response: 'Rerun internal.',
    })
    await runAppealResolutionAgent({ appealId: appeal.id, rerunById: staff.id }, secondCaller)

    expect(secondCaller).toHaveBeenCalledOnce()
    const updated = await getModerationAppealById(appeal.id)
    expect(updated!.recommended_action).toBe('reduce')
  })

  it('replaces an unapproved draft when a queued rerun completes', async () => {
    const appeal = await makeWarningAndAppeal()
    await runAppealResolutionAgent(
      { appealId: appeal.id },
      makeModelCaller({
        recommended_action: 'deny',
        public_response: 'First.',
        internal_response: 'First.',
      }),
    )

    await runAppealResolutionAgent(
      { appealId: appeal.id, rerunById: staff.id },
      makeModelCaller({
        recommended_action: 'reduce',
        public_response: 'Replacement.',
        internal_response: 'Replacement.',
      }),
    )

    const updated = await getModerationAppealById(appeal.id)
    expect(updated!.public_response).toBe('Replacement.')
    expect(updated!.approved_at).toBeNull()
  })

  it('calls the model for a community ban appeal', async () => {
    const bannedUser = await createTestUser()
    const community = await insertTestCommunity({ createdById: staff.id })
    const ban = await insertTestCommunityBan({
      communityId: community.id,
      userId: bannedUser.id,
      bannedById: staff.id,
      reason: `Ban reason ${randomUUID().slice(0, 8)}`,
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'ban',
      target_id: ban.id,
      appeal_reason: `Ban appeal reason ${randomUUID()}`,
    })
    const { appeal } = await createModerationAppeal(bannedUser, input)

    const callModel = makeModelCaller({
      recommended_action: 'deny',
      public_response: 'The ban was appropriate.',
      internal_response: 'User violated community rules.',
    })

    await runAppealResolutionAgent({ appealId: appeal.id }, callModel)

    expect(callModel).toHaveBeenCalledOnce()
    const updated = await getModerationAppealById(appeal.id)
    expect(updated!.ai_drafted_at).not.toBeNull()
    expect(updated!.recommended_action).toBe('deny')
  })

  it('calls the model for a post removal appeal', async () => {
    const author = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `appeal-test-post-${randomUUID().slice(0, 8)}`,
      title: `Appeal Test Post ${randomUUID().slice(0, 8)}`,
      markdown: 'Post content for removal appeal test.',
    })
    // Post must be rejected (removed) before it can be appealed
    await markPostFlaggedForModeration(postId)
    const input = parseCreateModerationAppealInput({
      target_type: 'removal',
      target_id: postId,
      appeal_reason: `Post removal appeal reason ${randomUUID()}`,
    })
    const { appeal } = await createModerationAppeal(author, input)

    const callModel = makeModelCaller({
      recommended_action: 'accept',
      public_response: 'The post has been restored.',
      internal_response: 'Removal was unwarranted.',
    })

    await runAppealResolutionAgent({ appealId: appeal.id }, callModel)

    expect(callModel).toHaveBeenCalledOnce()
    const updated = await getModerationAppealById(appeal.id)
    expect(updated!.ai_drafted_at).not.toBeNull()
    expect(updated!.recommended_action).toBe('accept')
  })

  it('includes community post removal kind in the model context', async () => {
    const author = await createTestUser()
    const community = await insertTestCommunity({ createdById: staff.id })
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `community-appeal-post-${randomUUID().slice(0, 8)}`,
      title: `Community Appeal Post ${randomUUID().slice(0, 8)}`,
      markdown: 'Post content for community removal appeal test.',
    })
    await insertTestCommunityPostReview({ communityId: community.id, postId })
    await updateTestCommunityPostReviewState({
      communityId: community.id,
      postId,
      unpublishedAt: new Date(),
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'removal',
      target_id: postId,
      post_removal_kind: 'community',
      appeal_reason: `Community post removal appeal reason ${randomUUID()}`,
    })
    const { appeal } = await createModerationAppeal(author, input)

    const callModel = makeModelCaller({
      recommended_action: 'deny',
      public_response: 'The community removal stands.',
      internal_response: 'Community moderation action was appropriate.',
    })

    await runAppealResolutionAgent({ appealId: appeal.id }, callModel)

    expect(callModel).toHaveBeenCalledOnce()
    expect(callModel.mock.calls[0][0]).toContain('Original action: Community post removal')
  })

  it('throws TypeError for invalid model response shape', async () => {
    const appeal = await makeWarningAndAppeal()

    await expect(
      runAppealResolutionAgent(
        { appealId: appeal.id },
        makeModelCaller({
          recommended_action: 'INVALID_ACTION',
          public_response: 'x',
          internal_response: 'x',
        }),
      ),
    ).rejects.toThrow(TypeError)
  })

  it('calls the model for a suspension appeal and includes suspension context', async () => {
    const suspendedUser = await createTestUser()
    await suspendTestUserGetId(suspendedUser.id, 'Test suspension reason')
    const input = parseCreateModerationAppealInput({
      target_type: 'suspension',
      appeal_reason: `Suspension appeal reason ${randomUUID()}`,
    })
    const { appeal } = await createModerationAppeal(suspendedUser, input)

    const callModel = makeModelCaller({
      recommended_action: 'deny',
      public_response: 'The suspension stands.',
      internal_response: 'User violated platform rules.',
    })

    await runAppealResolutionAgent({ appealId: appeal.id }, callModel)

    expect(callModel).toHaveBeenCalledOnce()
    const updated = await getModerationAppealById(appeal.id)
    expect(updated!.ai_drafted_at).not.toBeNull()
    expect(updated!.recommended_action).toBe('deny')
    expect(callModel.mock.calls[0][0]).toContain('Platform suspension')
  })
})
