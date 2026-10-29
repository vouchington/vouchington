import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, getTestCurrentPostClearance, insertTestPost } from '@voucha/test-helpers'
import { setPostClearanceStatus } from './set-status.mts'

describe('setPostClearanceStatus', () => {
  it('keeps the final public result and actor on the post across later transitions', async () => {
    const actor = await createTestUser({ administrator: true })
    const postId = await insertTestPost({
      title: `Current clearance ${randomUUID()}`,
      slug: `current-clearance-${randomUUID()}`,
      createdById: actor.id,
      markdown: 'Current clearance projection',
      clearanceStatus: 'pending',
    })
    const initial = await getTestCurrentPostClearance(postId)
    await setPostClearanceStatus(
      postId,
      'rejected',
      actor.id,
      undefined,
      {},
      {
        reasonCode: 'platform_policy',
        platformOverride: true,
        isCreationModerationBypass: true,
        privateNote: 'History only',
      },
    )
    const rejected = await getTestCurrentPostClearance(postId)
    expect(rejected).toMatchObject({
      clearance_changed_by_id: actor.id,
      clearance_public_reason_code: 'platform_policy',
      clearance_is_platform_override: true,
      has_creation_moderation_bypass: true,
      clearance_status: 'rejected',
      clearance_reason: 'platform_policy',
    })
    expect(BigInt(rejected!.clearance_version)).toBe(BigInt(initial!.clearance_version) + 1n)
    await setPostClearanceStatus(postId, 'approved', actor.id)
    const approved = await getTestCurrentPostClearance(postId)
    expect(approved).toMatchObject({
      clearance_changed_by_id: actor.id,
      clearance_public_reason_code: null,
      clearance_is_platform_override: false,
      has_creation_moderation_bypass: true,
      clearance_status: 'approved',
      clearance_reason: null,
    })
    expect(BigInt(approved!.clearance_version)).toBe(BigInt(rejected!.clearance_version) + 1n)
  })

  it('rejects a platform override without a stable public reason code', async () => {
    await expect(
      setPostClearanceStatus(
        randomUUID(),
        'approved',
        undefined,
        undefined,
        {},
        {
          platformOverride: true,
        },
      ),
    ).rejects.toThrow('Platform clearance overrides require a reason code')
  })

  it('rejects a private note unless the decision is a platform override', async () => {
    await expect(
      setPostClearanceStatus(
        randomUUID(),
        'approved',
        undefined,
        undefined,
        {},
        {
          privateNote: 'Internal review note',
        },
      ),
    ).rejects.toThrow('Private clearance notes are only allowed on platform overrides')
  })
})
