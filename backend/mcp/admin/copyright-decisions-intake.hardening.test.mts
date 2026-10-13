import { describe, expect, it } from 'vitest'
import { ALL_TOOLS, getRegisteredToolByName } from '@voucha/mcp/registry/index'
import { validateToolArguments } from '../../services/mcp-tools/validate-tool-arguments.mts'

const names = [
  'assess_copyright_legal_hold',
  'record_copyright_repeat_infringer_disposition',
  'record_copyright_repeat_infringer_outcome',
  'reinstate_copyright_repeat_infringer',
  'replay_copyright_email_intake_reply',
  'replay_copyright_intent',
  'resolve_copyright_legal_hold',
  'review_copyright_appeal',
  'review_copyright_counter_notice',
  'review_copyright_email_correspondence',
  'review_copyright_email_intake',
  'review_copyright_form_intake',
  'review_copyright_restriction',
  'revoke_copyright_guest_capability',
]

describe('copyright admin decision tool contracts', () => {
  it('registers the decision writes with closed rationale-bearing schemas and both exact scopes', () => {
    const tools = ALL_TOOLS.filter(tool => tool.meta?.switch === 'copyright.mcpDecisionTools')
    expect(tools.map(tool => tool.schema.name).toSorted()).toEqual(names)
    for (const tool of tools) {
      expect(tool.meta?.requiredScopes?.admin_mcp).toEqual([
        'copyright-notices:read',
        'copyright-notices:write',
      ])
      expect(tool.meta?.auditRationale).toBe(true)
      expect(tool.meta?.annotations).toMatchObject({
        readOnlyHint: false,
        idempotentHint: expect.any(Boolean),
      })
    }
    expect(getRegisteredToolByName('approve_copyright_email_intake')).toBeUndefined()
    expect(getRegisteredToolByName('replay_copyright_action_intent')).toBeUndefined()
  })

  it('rejects missing rationale for each registered decision contract', () => {
    const id = crypto.randomUUID()
    const rows: Array<{ name: string; option?: string; args: Record<string, unknown> }> = [
      { name: 'review_copyright_form_intake', args: { id, is_accepted: true } },
      {
        name: 'review_copyright_email_intake',
        option: 'approve',
        args: {
          intake_id: id,
          jurisdiction: 'us_dmca',
          claimant_display_name: null,
          claimant_contact: 'Synthetic claimant contact',
          claimant_email: 'claimant@example.test',
          work_description: 'An original photograph.',
          has_good_faith_belief: true,
          has_accuracy_authority_under_penalty_of_perjury: true,
          electronic_signature: 'Synthetic claimant',
          targets: [
            {
              surface: 'post-image',
              post_id: id,
              image_id: id,
              target_url: 'https://voucha.ai/posts/synthetic',
            },
          ],
        },
      },
      { name: 'review_copyright_email_intake', option: 'reject', args: { intake_id: id } },
      {
        name: 'review_copyright_email_correspondence',
        option: 'admit',
        args: { intake_id: id, kind: 'appeal' },
      },
      {
        name: 'review_copyright_email_correspondence',
        option: 'reject',
        args: { intake_id: id, kind: 'appeal' },
      },
      { name: 'replay_copyright_email_intake_reply', args: { intake_id: id } },
      {
        name: 'review_copyright_restriction',
        args: { id, restrictionId: id, action: 'confirm' },
      },
      { name: 'review_copyright_counter_notice', args: { id, is_accepted: false } },
      {
        name: 'review_copyright_appeal',
        args: { id, decisions: [{ restriction_id: id, action: 'confirm' }] },
      },
      {
        name: 'assess_copyright_legal_hold',
        args: { id, is_from_original_claimant: true, is_same_material: true, target_ids: [id] },
      },
      { name: 'resolve_copyright_legal_hold', args: { id, resolution_kind: 'dismissed' } },
      {
        name: 'record_copyright_repeat_infringer_disposition',
        args: { id, disposition: 'duplicate' },
      },
      { name: 'record_copyright_repeat_infringer_outcome', args: { id, outcome: 'no_action' } },
      { name: 'reinstate_copyright_repeat_infringer', args: { accountUserId: id } },
      { name: 'replay_copyright_intent', option: 'delivery', args: { id, intentId: id } },
      { name: 'replay_copyright_intent', option: 'action', args: { id, intentId: id } },
      { name: 'revoke_copyright_guest_capability', args: { id, capabilityId: id } },
    ]
    expect(
      rows
        .map(row => row.name)
        .filter((name, index, all) => all.indexOf(name) === index)
        .toSorted(),
    ).toEqual(names)
    for (const row of rows) {
      const tool = getRegisteredToolByName(row.name)!
      const input = (args: Record<string, unknown>) =>
        row.option ? { option: row.option, arguments: args } : args
      expect(
        validateToolArguments(
          tool.schema.parameters,
          input({ ...row.args, rationale: 'Staff review.' }),
        ),
      ).toBeNull()
      expect(validateToolArguments(tool.schema.parameters, input(row.args))).toContain('rationale')
      expect(
        validateToolArguments(tool.schema.parameters, input({ ...row.args, rationale: '   ' })),
      ).not.toBeNull()
      expect(
        validateToolArguments(
          tool.schema.parameters,
          input({ ...row.args, rationale: 'x'.repeat(10_001) }),
        ),
      ).not.toBeNull()
      expect(
        validateToolArguments(
          tool.schema.parameters,
          input({ ...row.args, rationale: 'Staff review.', injected: true }),
        ),
      ).not.toBeNull()
    }
  })
})
