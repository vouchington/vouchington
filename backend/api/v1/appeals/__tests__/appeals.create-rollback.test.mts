import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { withPostgresQueryFailureForTest } from '@voucha/test-helpers/postgres-query-failure'
import {
  listTestModerationCasesForEntity,
  resolveTestModerationCase,
} from '@voucha/test-helpers/entities/moderation-case-reads'
import { countTestModerationAppealsByAppellant } from '@voucha/test-helpers/mcp-write-tool-rows'
import { createTestUser, insertTestUserWarning } from '@voucha/test-helpers'

describe('POST /api/v1/appeals rollback', () => {
  it('leaves a resolved warning case resolved when the appeal insert fails', async () => {
    const staff = await createTestUser()
    const appellant = await createTestUser()
    const warning = await insertTestUserWarning({ userId: appellant.id, issuedById: staff.id })
    await resolveTestModerationCase(warning.case_id, staff.id)
    const entity = { entityType: 'user', entityId: appellant.id } as const
    const before = await listTestModerationCasesForEntity(entity)
    expect(before).toMatchObject([{ id: warning.case_id, resolved_by_id: staff.id }])
    expect(before[0]?.resolved_at).not.toBeNull()
    const request = createRequest()
    await request.authenticateAs(appellant)
    const requestId = crypto.randomUUID()

    const { result: response, error } = await withPostgresQueryFailureForTest(
      '/* createModerationAppeal */',
      () =>
        request
          .post('/api/v1/appeals')
          .set('x-request-id', requestId)
          .send({
            target_type: 'warning',
            target_id: warning.id,
            appeal_reason: 'Please review this warning.',
          })
          .expect(500),
      { requestId },
    )

    expect(error).toMatchObject({ code: '25P02' })
    expect(response.body).toMatchObject({ code: '25P02', request_id: requestId })
    expect(await listTestModerationCasesForEntity(entity)).toEqual(before)
    expect(await countTestModerationAppealsByAppellant(appellant.id)).toBe(0)
  })
})
