import {
  recordCopyrightRepeatInfringerReviewOutcome,
  recordCopyrightRepeatInfringerReinstatement,
  recordStaffCopyrightRepeatInfringerDisposition,
  replayFailedCopyrightActionIntent,
  revokeCopyrightGuestCapability,
} from '@services/copyright-notices'
import { replayCopyrightDeliveryIntentAndEnqueue } from '@services/copyright-notices/copyright-mcp-write-actions'
import { UUID_INPUT } from './create-admin-tool.mts'
import {
  copyrightDecisionTool,
  validateCopyrightDecisionRequest,
} from './copyright-decisions-intake.mts'

const dispositionPath = '/api/v1/copyright-repeat-infringer-incidents/:id/dispositions'
const outcomePath = '/api/v1/copyright-repeat-infringer-reviews/:id/outcomes'
const reinstatementPath =
  '/api/v1/copyright-repeat-infringer-accounts/:accountUserId/reinstatements'
const deliveryPath = '/api/v1/copyright-notices/:id/delivery-intents/:intentId/replays'
const actionPath = '/api/v1/copyright-notices/:id/action-intents/:intentId/replays'
const revocationPath = '/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/revocation'

export const adminCopyrightDecisionOperationTools = [
  copyrightDecisionTool<{
    id: string
    disposition: 'abusive' | 'duplicate' | 'withdrawn'
    rationale: string
  }>({
    name: 'record_copyright_repeat_infringer_disposition',
    path: dispositionPath,
    properties: {
      id: UUID_INPUT,
      disposition: {
        type: 'string',
        enum: ['abusive', 'duplicate', 'withdrawn'],
      },
    },
    required: ['id', 'disposition'],
    idempotent: false,
    run: async (user, args) => {
      const body = { disposition: args.disposition, rationale: args.rationale }
      validateCopyrightDecisionRequest(dispositionPath, { id: args.id }, body)
      return {
        copyright_repeat_infringer_disposition:
          await recordStaffCopyrightRepeatInfringerDisposition({
            currentUser: user,
            incidentId: args.id,
            recordedAt: new Date(),
            ...body,
          }),
      }
    },
  }),
  copyrightDecisionTool<{
    id: string
    outcome: 'no_action' | 'restrict' | 'terminate' | 'warning'
    rationale: string
  }>({
    name: 'record_copyright_repeat_infringer_outcome',
    path: outcomePath,
    properties: {
      id: UUID_INPUT,
      outcome: {
        type: 'string',
        enum: ['no_action', 'restrict', 'terminate', 'warning'],
      },
    },
    required: ['id', 'outcome'],
    idempotent: false,
    destructive: true,
    run: async (user, args) => {
      const body = { outcome: args.outcome, rationale: args.rationale }
      validateCopyrightDecisionRequest(outcomePath, { id: args.id }, body)
      return {
        copyright_repeat_infringer_review: await recordCopyrightRepeatInfringerReviewOutcome({
          currentUser: user,
          reviewId: args.id,
          recordedAt: new Date(),
          ...body,
        }),
      }
    },
  }),
  copyrightDecisionTool<{ accountUserId: string; rationale: string }>({
    name: 'reinstate_copyright_repeat_infringer',
    path: reinstatementPath,
    properties: { accountUserId: UUID_INPUT },
    required: ['accountUserId'],
    idempotent: false,
    run: async (user, args) => {
      const body = { rationale: args.rationale }
      validateCopyrightDecisionRequest(
        reinstatementPath,
        { accountUserId: args.accountUserId },
        body,
      )
      return {
        copyright_repeat_infringer_review: await recordCopyrightRepeatInfringerReinstatement({
          currentUser: user,
          accountUserId: args.accountUserId,
          recordedAt: new Date(),
          ...body,
        }),
      }
    },
  }),
  copyrightDecisionTool<{ id: string; intentId: string; rationale: string }>({
    name: 'replay_copyright_delivery_intent',
    path: deliveryPath,
    properties: { id: UUID_INPUT, intentId: UUID_INPUT },
    required: ['id', 'intentId'],
    idempotent: true,
    run: (user, args) => {
      validateCopyrightDecisionRequest(deliveryPath, {
        id: args.id,
        intentId: args.intentId,
      })
      return replayCopyrightDeliveryIntentAndEnqueue(user, args.id, args.intentId)
    },
  }),
  copyrightDecisionTool<{ id: string; intentId: string; rationale: string }>({
    name: 'replay_copyright_action_intent',
    path: actionPath,
    properties: { id: UUID_INPUT, intentId: UUID_INPUT },
    required: ['id', 'intentId'],
    idempotent: true,
    run: async (user, args) => {
      validateCopyrightDecisionRequest(actionPath, {
        id: args.id,
        intentId: args.intentId,
      })
      return {
        replayed: await replayFailedCopyrightActionIntent({
          noticeId: args.id,
          intentId: args.intentId,
          actorUserId: user.id,
        }),
      }
    },
  }),
  copyrightDecisionTool<{
    id: string
    capabilityId: string
    rationale: string
  }>({
    name: 'revoke_copyright_guest_capability',
    path: revocationPath,
    properties: { id: UUID_INPUT, capabilityId: UUID_INPUT },
    required: ['id', 'capabilityId'],
    idempotent: true,
    destructive: true,
    run: async (user, args) => {
      validateCopyrightDecisionRequest(revocationPath, {
        id: args.id,
        capabilityId: args.capabilityId,
      })
      const revokedAt = new Date()
      await revokeCopyrightGuestCapability({
        currentUser: user,
        noticeId: args.id,
        capabilityId: args.capabilityId,
        revokedAt,
      })
      return {
        copyright_guest_capability: {
          id: args.capabilityId,
          revoked_at: revokedAt.toISOString(),
        },
      }
    },
  }),
]
