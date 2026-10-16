import { describe, expect, it } from 'vitest'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import { callRejectedMcpTool, optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import { communityModerationGroups } from './community-moderation-tools.mts'

const cases = [
  ['claim_post', 'postId'],
  ['release_post_claim', 'postId'],
  ['escalate_post', 'postId'],
  ['deescalate_post', 'postId'],
  ['open_post_mod_internal_thread', 'postId'],
  ['dismiss_automod_flag', 'postId'],
  ['claim_report', 'reportId'],
  ['release_report_claim', 'reportId'],
  ['escalate_report', 'reportId'],
  ['deescalate_report', 'reportId'],
  ['open_report_mod_internal_thread', 'reportId'],
  ['resolve_report', 'reportId'],
  ['lift_ban', 'userId'],
  ['dismiss_ban_evasion', 'userId'],
  ['lift_restriction', 'id'],
] as const

describe('community moderation REST UUID path validation', () => {
  it.each(cases)('rejects malformed %s path IDs before dispatch', async (option, field) => {
    const caller = await createTestPlusMcpCaller()
    const group = communityModerationGroups.find(entry =>
      entry.options.some(candidate => candidate.option === option),
    )!
    for (const invalidId of ['not-a-uuid', `urn:uuid:${crypto.randomUUID()}`]) {
      const error = await callRejectedMcpTool(
        caller,
        group.name,
        optionArgs(option, {
          community: crypto.randomUUID(),
          [field]: invalidId,
          ...(option === 'resolve_report' ? { status: 'dismissed' } : {}),
        }),
        ['community-moderation:read', 'community-moderation:write'],
      )
      expect(error).toContain('Invalid tool arguments')
    }
  })
})
