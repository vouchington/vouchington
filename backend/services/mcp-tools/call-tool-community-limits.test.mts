import createHttpError from 'http-errors'
import {
  COMMUNITY_MEMBERSHIP_LIMIT_REACHED,
  COMMUNITY_MODERATOR_LIMIT_REACHED,
  HOUSEHOLD_LIMIT_REACHED,
  HOUSEHOLD_MEMBER_LIMIT_REACHED,
  INDIVIDUAL_HOUSEHOLD_LIMIT_REACHED,
} from '@modules/on-error/error-codes'
import { createTestUser } from '@voucha/test-helpers'
import { ALL_TOOLS } from '@voucha/mcp/registry/index'
import { optionArgs } from '../../test-helpers/mcp-tool-contract.mts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { callMcpTool } from './call-tool.mts'
import { USER_MCP_SERVER_CONFIG } from './config.mts'

describe('community limit error transport', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([
    COMMUNITY_MEMBERSHIP_LIMIT_REACHED,
    COMMUNITY_MODERATOR_LIMIT_REACHED,
    HOUSEHOLD_LIMIT_REACHED,
    HOUSEHOLD_MEMBER_LIMIT_REACHED,
    INDIVIDUAL_HOUSEHOLD_LIMIT_REACHED,
  ])('preserves community cap %s through the MCP error envelope', async code => {
    const user = { ...(await createTestUser()), membership_plan: null }
    const tool = ALL_TOOLS.find(candidate => candidate.schema.name === 'discover_topics')!
    vi.spyOn(tool, 'function').mockReturnValue(async () => {
      throw Object.assign(createHttpError(409, 'Community admission limit reached'), { code })
    })
    const result = await callMcpTool(
      'discover_topics',
      optionArgs('search'),
      user,
      ['topics:read'],
      USER_MCP_SERVER_CONFIG,
    )
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({
      error: {
        status: 409,
        code,
        message: 'Community admission limit reached',
        retryable: false,
      },
    })
  })
})
