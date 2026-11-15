import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { communityAgentPromptsConfig } from '@services/community-agent-prompts/config'
import { deactivateCommunityPromptsForUser } from '@services/community-agent-prompts/deactivate-for-user'
import { getCommunityAgentPrompt } from '@services/community-agent-prompts/get'
import { enqueueProcessCommunityAgentPromptsDeactivated } from '@queues/entity-listeners/enqueues/enqueue-jobs'
import { ENTITY_LISTENERS_COMMUNITY_AGENT_PROMPTS_DEACTIVATED_JOB } from '@queues/background/enqueues/entity-listeners-jobs'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { getSharedBackgroundWorker } from '../../../../test-helpers/shared-background-worker.mts'

describe('community prompt deactivation pages', () => {
  beforeAll(async () => {
    await communityAgentPromptsConfig.waitForInitialization()
    await communityAgentPromptsConfig.close()
  })

  it('reports remaining work after one page without deactivating excluded ownership', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(communityAgentPromptsConfig, { moderation_page_size: 1 }),
    )
    const [owner, other] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner.id })
    const elsewhere = await insertTestCommunity({ createdById: owner.id })
    const first = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
      slotAllocated: true,
    })
    const second = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
      slotAllocated: true,
    })
    const excludedOwner = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: other.id,
      slotAllocated: true,
    })
    const excludedCommunity = await insertTestCommunityAgentPrompt({
      communityId: elsewhere.id,
      createdById: owner.id,
      slotAllocated: true,
    })

    await expect(
      deactivateCommunityPromptsForUser(owner.id, owner.id, community.id),
    ).resolves.toEqual({ hasMore: true })
    const afterFirstPage = await Promise.all([
      getCommunityAgentPrompt(first.id),
      getCommunityAgentPrompt(second.id),
    ])
    expect(afterFirstPage.filter(prompt => prompt!.is_slot_allocated)).toHaveLength(1)
    await expect(
      deactivateCommunityPromptsForUser(owner.id, owner.id, community.id),
    ).resolves.toEqual({ hasMore: false })
    for (const promptId of [first.id, second.id]) {
      await expect(getCommunityAgentPrompt(promptId)).resolves.toMatchObject({
        is_slot_allocated: false,
        activated_at: null,
        deactivated_at: expect.any(Date),
      })
    }
    for (const promptId of [excludedOwner.id, excludedCommunity.id]) {
      await expect(getCommunityAgentPrompt(promptId)).resolves.toMatchObject({
        is_slot_allocated: true,
        deactivated_at: null,
      })
    }
  })

  it('continues the existing listener job until later pages are deactivated', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(communityAgentPromptsConfig, { moderation_page_size: 1 }),
    )
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const prompts = await Promise.all(
      [0, 1, 2].map(() =>
        insertTestCommunityAgentPrompt({
          communityId: community.id,
          createdById: owner.id,
          slotAllocated: true,
        }),
      ),
    )
    const worker = getSharedBackgroundWorker()
    const finished = Promise.withResolvers<void>()
    function isOwned(job: { name: string; data: unknown } | undefined) {
      const data = job?.data
      return (
        job?.name === ENTITY_LISTENERS_COMMUNITY_AGENT_PROMPTS_DEACTIVATED_JOB.name &&
        typeof data === 'object' &&
        data !== null &&
        'userId' in data &&
        data.userId === owner.id &&
        'communityId' in data &&
        data.communityId === community.id
      )
    }
    function onCompleted(job: { name: string; data: unknown }, result: unknown) {
      if (
        isOwned(job) &&
        typeof result === 'object' &&
        result !== null &&
        'hasMore' in result &&
        result.hasMore === false
      ) {
        finished.resolve()
      }
    }
    function onFailed(job: { name: string; data: unknown } | undefined, error: Error) {
      if (isOwned(job)) finished.reject(error)
    }
    worker.on('completed', onCompleted)
    worker.on('failed', onFailed)
    try {
      const terminal = waitForRealGlideEvent(finished.promise, 'owned prompt deactivation chain')
      try {
        await enqueueProcessCommunityAgentPromptsDeactivated({
          actorUserId: owner.id,
          userId: owner.id,
          communityId: community.id,
        })
      } catch (err) {
        finished.reject(err)
      }
      await terminal
    } finally {
      worker.off('completed', onCompleted)
      worker.off('failed', onFailed)
    }
    for (const prompt of prompts) {
      await expect(getCommunityAgentPrompt(prompt.id)).resolves.toMatchObject({
        is_slot_allocated: false,
        activated_at: null,
        deactivated_at: expect.any(Date),
      })
    }
  })
})
