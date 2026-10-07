import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { withPostgresQueryFailureForTest } from '@voucha/test-helpers/postgres-query-failure'
import { listTestModerationCasesForEntity } from '@voucha/test-helpers/entities/moderation-case-reads'
import { countTestModerationReportsByReporter } from '@voucha/test-helpers/mcp-write-tool-rows'

describe('POST /api/v1/reports rollback', () => {
  it('rolls back the new case when the report insert fails', async () => {
    const reporter = await createTestUser()
    const targetPostId = await insertTestPost({
      createdById: (await createTestUser()).id,
      slug: `report-insert-failure-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Report insert failure target',
      markdown: 'Test body',
    })
    const request = createRequest()
    await request.authenticateAs(reporter)
    const requestId = crypto.randomUUID()
    const entity = { entityType: 'post', entityId: targetPostId } as const
    expect(await listTestModerationCasesForEntity(entity)).toEqual([])

    const { result: response, error } = await withPostgresQueryFailureForTest(
      '/* createModerationReport */',
      () =>
        request
          .post('/api/v1/reports')
          .set('x-request-id', requestId)
          .send({ entityType: 'post', entityId: targetPostId, reason: 'spam' })
          .expect(500),
      { command: 'INSERT', requestId },
    )

    expect(error).toMatchObject({ code: '25P02' })
    expect(response.body).toMatchObject({ code: '25P02', request_id: requestId })
    expect(await listTestModerationCasesForEntity(entity)).toEqual([])
    expect(await countTestModerationReportsByReporter(reporter.id)).toBe(0)
  })
})
