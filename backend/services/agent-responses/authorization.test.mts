import { describe, expect, it } from 'vitest'
import type { AgentResponseRecord } from './types.mts'
import {
  currentUserCanViewAgentResponse,
  assertCurrentUserCanViewAgentResponse,
} from './authorization.mts'

function makeAgentResponse(overrides?: Partial<AgentResponseRecord>): AgentResponseRecord {
  return {
    id: 'aaaaaaaa-0000-7000-8000-000000000001',
    created_by_id: 'user-owner-id',
    agent: 'research',
    input: { task: 'What is the capital of France?' },
    output: null,
    model_name: null,
    model_provider: null,
    job_id: null,
    error: null,
    termination_reason: null,
    started_at: null,
    completed_at: null,
    failed_at: null,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }
}

describe('authorization', () => {
  const owner = { id: 'user-owner-id', roles: [] as string[] }
  const otherUser = { id: 'user-other-id', roles: [] as string[] }
  const admin = { id: 'user-admin-id', roles: ['administrator'] }
  const staff = { id: 'user-staff-id', roles: ['staff'] }

  describe('currentUserCanViewAgentResponse', () => {
    it('returns true when user is the creator', () => {
      const response = makeAgentResponse()
      expect(currentUserCanViewAgentResponse(response, owner)).toBe(true)
    })

    it('returns false for another regular user', () => {
      const response = makeAgentResponse()
      expect(currentUserCanViewAgentResponse(response, otherUser)).toBe(false)
    })

    it('returns true for administrator', () => {
      const response = makeAgentResponse()
      expect(currentUserCanViewAgentResponse(response, admin)).toBe(true)
    })

    it('returns true for staff', () => {
      const response = makeAgentResponse()
      expect(currentUserCanViewAgentResponse(response, staff)).toBe(true)
    })
  })

  describe('assertCurrentUserCanViewAgentResponse', () => {
    it('does not throw when user is the creator', () => {
      const response = makeAgentResponse()
      expect(() => assertCurrentUserCanViewAgentResponse(response, owner)).not.toThrow()
    })

    it('throws 403 when user is not authorized', () => {
      const response = makeAgentResponse()
      expect(() => assertCurrentUserCanViewAgentResponse(response, otherUser)).toThrow(
        'Access denied',
      )
    })
  })
})
