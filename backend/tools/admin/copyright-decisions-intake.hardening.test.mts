import { describe, expect, it } from 'vitest'
import { validateToolArguments } from '../../services/mcp-tools/validate-tool-arguments.mts'
import { adminCopyrightDecisionIntakeTools } from './copyright-decisions-intake.mts'
import { adminCopyrightDecisionCaseTools } from './copyright-decisions-cases.mts'
import { adminCopyrightDecisionOperationTools } from './copyright-decisions-operations.mts'

const tools = [
  ...adminCopyrightDecisionIntakeTools,
  ...adminCopyrightDecisionCaseTools,
  ...adminCopyrightDecisionOperationTools,
]
const names = [
  'review_copyright_form_intake',
  'approve_copyright_email_intake',
  'reject_copyright_email_intake',
  'admit_copyright_email_correspondence',
  'reject_copyright_email_correspondence',
  'replay_copyright_email_intake_reply',
  'review_copyright_restriction',
  'review_copyright_counter_notice',
  'review_copyright_appeal',
  'assess_copyright_legal_hold',
  'resolve_copyright_legal_hold',
  'record_copyright_repeat_infringer_disposition',
  'record_copyright_repeat_infringer_outcome',
  'reinstate_copyright_repeat_infringer',
  'replay_copyright_delivery_intent',
  'replay_copyright_action_intent',
  'revoke_copyright_guest_capability',
]

describe('copyright admin decision tool contracts', () => {
  it('registers exactly the approved writes with closed rationale-bearing schemas and both exact scopes', () => {
    expect(tools.map(tool => tool.schema.name)).toEqual(names)
    expect(tools).toHaveLength(17)
    expect(names).not.toContain('issue_copyright_guest_capability')
    for (const tool of tools) {
      const parameters = tool.schema.parameters as {
        required: string[]
        additionalProperties: boolean
        properties: { rationale: { minLength: number; maxLength: number } }
      }
      expect(parameters.additionalProperties).toBe(false)
      expect(parameters.required).toContain('rationale')
      expect(parameters.properties.rationale).toMatchObject({
        minLength: 1,
        maxLength: 10_000,
      })
      expect(tool.meta?.requiredScopes?.admin_mcp).toEqual([
        'copyright-notices:read',
        'copyright-notices:write',
      ])
      expect(tool.meta?.switch).toBe('copyright.mcpDecisionTools')
      expect(tool.meta?.auditRationale).toBe(true)
      expect(tool.meta?.annotations).toMatchObject({
        readOnlyHint: false,
        idempotentHint: expect.any(Boolean),
      })
      expect(tool.meta?.api?.[0]).toMatchObject({
        method: 'POST',
        path: expect.any(String),
      })
    }
  })
  it('rejects missing rationale for each of the 17 closed write contracts', () => {
    const id = crypto.randomUUID()
    const inputs: Record<string, Record<string, unknown>> = {
      review_copyright_form_intake: { id, is_accepted: true },
      approve_copyright_email_intake: { intake_id: id },
      reject_copyright_email_intake: { intake_id: id },
      admit_copyright_email_correspondence: { intake_id: id, kind: 'appeal' },
      reject_copyright_email_correspondence: { intake_id: id, kind: 'appeal' },
      replay_copyright_email_intake_reply: { intake_id: id },
      review_copyright_restriction: {
        id,
        restrictionId: id,
        action: 'confirm',
      },
      review_copyright_counter_notice: { id, is_accepted: false },
      review_copyright_appeal: {
        id,
        decisions: [{ restriction_id: id, action: 'confirm' }],
      },
      assess_copyright_legal_hold: {
        id,
        is_from_original_claimant: true,
        is_same_material: true,
        target_ids: [id],
      },
      resolve_copyright_legal_hold: { id, resolution_kind: 'dismissed' },
      record_copyright_repeat_infringer_disposition: {
        id,
        disposition: 'duplicate',
      },
      record_copyright_repeat_infringer_outcome: { id, outcome: 'no_action' },
      reinstate_copyright_repeat_infringer: { accountUserId: id },
      replay_copyright_delivery_intent: { id, intentId: id },
      replay_copyright_action_intent: { id, intentId: id },
      revoke_copyright_guest_capability: { id, capabilityId: id },
    }
    expect(Object.keys(inputs)).toEqual(names)
    for (const tool of tools) {
      const args = inputs[tool.schema.name]!
      expect(
        validateToolArguments(tool.schema.parameters, {
          ...args,
          rationale: 'Staff review.',
        }),
      ).toBeNull()
      expect(validateToolArguments(tool.schema.parameters, args)).toContain('rationale')
      expect(
        validateToolArguments(tool.schema.parameters, { ...args, rationale: '   ' }),
      ).not.toBeNull()
      expect(
        validateToolArguments(tool.schema.parameters, {
          ...args,
          rationale: 'x'.repeat(10_001),
        }),
      ).not.toBeNull()
      expect(
        validateToolArguments(tool.schema.parameters, {
          ...args,
          rationale: 'Staff review.',
          injected: true,
        }),
      ).not.toBeNull()
    }
  })
})
