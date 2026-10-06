import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { createOutboundCopyrightCorrespondence } from '@services/copyright-notices/correspondence'
import { createCopyrightDeliveryIntent } from '@services/copyright-notices/delivery-intents'
import { useCopyrightMcpDecisionTools } from '@voucha/test-helpers/copyright-mcp-write-fixtures'
import {
  countTestCopyrightLifecycleEvents,
  readTestCopyrightActionIntentState,
  failTestCopyrightDeliveryIntent,
} from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { declineTestCopyrightEmailIntake } from '@voucha/test-helpers/services/copyright-notices/declined-email-intake'
import {
  readTestCopyrightDeliveryIntentReplayEvents,
  readTestCopyrightDeliveryIntentReplayFacts,
} from '@voucha/test-helpers/data-stores/psql/copyright-email-intake-reply-replays'
import { createCopyrightReplayFixture } from '@voucha/test-helpers/copyright-route-replay-setup'
import { exhaustCopyrightActionIntent } from '@voucha/test-helpers/copyright-route-replay-fixtures'

import { callMcpTool } from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'
import type { PrivateUser } from '@services/users/types'

const callTestCopyrightWriteTool = (user: PrivateUser, name: string, args: unknown) =>
  callMcpTool(
    name,
    args,
    { ...user, membership_plan: null },
    ['copyright-notices:read', 'copyright-notices:write'],
    ADMIN_MCP_SERVER_CONFIG,
    true,
  )

describe('registered copyright operations write tools', () => {
  useCopyrightMcpDecisionTools()

  it('replays one failed intake reply using the stored delivery and audits the credential owner', async () => {
    const declined = await declineTestCopyrightEmailIntake()
    await failTestCopyrightDeliveryIntent(declined.intentId)
    const failed = await readTestCopyrightDeliveryIntentReplayFacts(declined.intentId)
    const admin = await createTestUser({ administrator: true })
    const args = {
      intake_id: declined.intakeId,
      rationale: 'The failed reply should be retried.',
    }
    const replay = await callTestCopyrightWriteTool(
      admin,
      'replay_copyright_email_intake_reply',
      args,
    )
    expect(replay.isError).not.toBe(true)
    expect(replay.structuredContent).toMatchObject({ replayed: true })
    expect(await readTestCopyrightDeliveryIntentReplayFacts(declined.intentId)).toMatchObject({
      state: 'pending',
      body_ciphertext: failed.body_ciphertext,
    })
    expect(await readTestCopyrightDeliveryIntentReplayEvents(declined.intentId)).toEqual([
      {
        copyright_notice_id: null,
        change_type: 'delivery_intent_replayed',
        changed_by_id: admin.id,
      },
    ])
    const again = await callTestCopyrightWriteTool(
      admin,
      'replay_copyright_email_intake_reply',
      args,
    )
    expect(again.structuredContent).toMatchObject({ replayed: false })
    expect(await readTestCopyrightDeliveryIntentReplayEvents(declined.intentId)).toHaveLength(1)
  })

  it('replays one failed case delivery intent and leaves a second invocation unchanged', async () => {
    const restricted = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    const aggregate = await getCopyrightNoticePrivateAggregate(restricted.noticeId)
    const submissionId = aggregate?.submissions[0]?.id
    if (!submissionId) throw new Error('Notice submission missing')
    const correspondence = await createOutboundCopyrightCorrespondence({
      noticeId: restricted.noticeId,
      submissionId,
      correspondenceKind: 'receipt',
      compositionKind: 'deterministic_template',
      bodyCiphertext: `receipt-${crypto.randomUUID()}`,
      draftedById: null,
    })
    const delivery = await createCopyrightDeliveryIntent({
      noticeId: restricted.noticeId,
      submissionId,
      correspondenceId: correspondence.id,
      recipientUserId: null,
      recipientRole: 'claimant',
      deliveryKind: 'claimant_receipt',
      channel: 'email',
      idempotencyKey: `mcp-replay-${crypto.randomUUID()}`,
      recipientEmail: `mcp-${crypto.randomUUID()}@example.test`,
    })
    await failTestCopyrightDeliveryIntent(delivery.id)
    const admin = await createTestUser({ administrator: true })
    const args = {
      id: restricted.noticeId,
      intentId: delivery.id,
      rationale: 'The failed delivery is eligible for retry.',
    }
    const first = await callTestCopyrightWriteTool(admin, 'replay_copyright_delivery_intent', args)
    expect(first.isError).not.toBe(true)
    expect(first.structuredContent).toMatchObject({ replayed: true })
    const state = (
      await getCopyrightNoticePrivateAggregate(restricted.noticeId)
    )?.deliveryIntents.find(row => row.id === delivery.id)
    expect(state?.state).toBe('pending')
    const second = await callTestCopyrightWriteTool(admin, 'replay_copyright_delivery_intent', args)
    expect(second.structuredContent).toMatchObject({ replayed: false })
  })

  it('requires an audit-only rationale and replays a failed action exactly once under the credential owner', async () => {
    const fixture = await createCopyrightReplayFixture()
    await exhaustCopyrightActionIntent(fixture.intentId)
    const admin = await createTestUser({ administrator: true })
    const path = { id: fixture.noticeId, intentId: fixture.intentId }

    await expect(
      callTestCopyrightWriteTool(admin, 'replay_copyright_action_intent', path),
    ).rejects.toMatchObject({ code: ErrorCode.InvalidParams })
    expect(await readTestCopyrightActionIntentState(fixture.intentId)).toBe('failed')

    const args = {
      ...path,
      rationale: 'The earlier delivery failure has been reviewed.',
    }
    const replay = await callTestCopyrightWriteTool(admin, 'replay_copyright_action_intent', args)
    expect(replay.isError).not.toBe(true)
    expect(replay.structuredContent).toEqual({ replayed: true })
    expect(await readTestCopyrightActionIntentState(fixture.intentId)).toBe('pending')
    expect(
      await countTestCopyrightLifecycleEvents({
        noticeId: fixture.noticeId,
        eventType: 'copyright_action_replayed',
        actorUserId: admin.id,
      }),
    ).toBe(1)

    const repeat = await callTestCopyrightWriteTool(admin, 'replay_copyright_action_intent', args)
    expect(repeat.structuredContent).toEqual({ replayed: false })
    expect(
      await countTestCopyrightLifecycleEvents({
        noticeId: fixture.noticeId,
        eventType: 'copyright_action_replayed',
        actorUserId: admin.id,
      }),
    ).toBe(1)
  })
})
