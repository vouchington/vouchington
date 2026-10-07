import { UUID_INPUT } from './create-admin-tool.mts'
import { RATIONALE_INPUT } from './copyright-decisions-intake.mts'

export type AppealArgs = {
  id: string
  decisions: Array<{ restriction_id: string; action: 'confirm' | 'reverse' }>
  recommendation_id?: string | null
  manual_fallback_reason?: string | null
  rationale: string
}

export type HoldArgs = {
  id: string
  is_from_original_claimant: boolean
  is_same_material: boolean
  proceeding_kind?: 'federal_court' | 'ccb' | null
  ccb_claim_kind?: 'claim' | 'counterclaim' | null
  commenced_at?: string | null
  received_by_designated_agent_at?: string | null
  target_ids: string[]
  rationale: string
}

export const APPEAL_PROPERTIES = {
  id: UUID_INPUT,
  decisions: {
    type: 'array',
    minItems: 1,
    maxItems: 20,
    items: {
      type: 'object',
      properties: {
        restriction_id: UUID_INPUT,
        action: { type: 'string', enum: ['confirm', 'reverse'] },
      },
      required: ['restriction_id', 'action'],
      additionalProperties: false,
    },
  },
  recommendation_id: { anyOf: [UUID_INPUT, { type: 'null' }] },
  manual_fallback_reason: { anyOf: [RATIONALE_INPUT, { type: 'null' }] },
}

export const HOLD_PROPERTIES = {
  id: UUID_INPUT,
  is_from_original_claimant: { type: 'boolean' },
  is_same_material: { type: 'boolean' },
  proceeding_kind: {
    anyOf: [{ type: 'string', enum: ['federal_court', 'ccb'] }, { type: 'null' }],
  },
  ccb_claim_kind: {
    anyOf: [{ type: 'string', enum: ['claim', 'counterclaim'] }, { type: 'null' }],
  },
  commenced_at: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  received_by_designated_agent_at: {
    anyOf: [{ type: 'string' }, { type: 'null' }],
  },
  target_ids: {
    type: 'array',
    items: UUID_INPUT,
    minItems: 1,
    maxItems: 20,
    uniqueItems: true,
  },
}

export function copyrightAppealBody(args: AppealArgs) {
  return {
    rationale: args.rationale,
    decisions: args.decisions,
    ...(args.recommendation_id !== undefined ? { recommendation_id: args.recommendation_id } : {}),
    ...(args.manual_fallback_reason !== undefined
      ? { manual_fallback_reason: args.manual_fallback_reason }
      : {}),
  }
}

export function copyrightHoldBody(args: HoldArgs) {
  return {
    rationale: args.rationale,
    is_from_original_claimant: args.is_from_original_claimant,
    is_same_material: args.is_same_material,
    target_ids: args.target_ids,
    ...(args.proceeding_kind !== undefined ? { proceeding_kind: args.proceeding_kind } : {}),
    ...(args.ccb_claim_kind !== undefined ? { ccb_claim_kind: args.ccb_claim_kind } : {}),
    ...(args.commenced_at !== undefined ? { commenced_at: args.commenced_at } : {}),
    ...(args.received_by_designated_agent_at !== undefined
      ? {
          received_by_designated_agent_at: args.received_by_designated_agent_at,
        }
      : {}),
  }
}
