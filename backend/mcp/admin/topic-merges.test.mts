import { describe, expect, it } from 'vitest'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { findSchemaViolation } from '@vouchington/mcp-server/schema'
import { getRegisteredToolByName } from '../registry/index.mts'
import { settleTopicMergeOperationForTest } from '@voucha/test-helpers/merge-topics'

describe('admin topic merge REST/MCP contract', () => {
  it('returns the same pending operation and status fields through both surfaces', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user: admin })
    const destination = await createTestTopic({ user: admin })
    const submit = getRegisteredToolByName('merge_topic')!
    const status = getRegisteredToolByName('get_topic_merge')!
    const admitted = await submit.function(admin)({
      source_id_or_slug: source.id,
      destination_id_or_slug: destination.id,
    })
    expect(findSchemaViolation(submit.meta!.outputSchema!, admitted)).toBeNull()
    const operation = (admitted as { topic_merge: { id: string; status_url: string } }).topic_merge
    expect(admitted).toMatchObject({
      topic_merge: {
        source_topic_id: source.id,
        destination_topic_id: destination.id,
        status: 'queued',
        completed_at: null,
        error_code: null,
      },
    })
    const request = createRequest()
    await request.authenticateAs(admin)
    const rest = await request.get(operation.status_url).expect(200)
    const mcp = await status.function(admin)({
      source_id_or_slug: source.id,
      operation_id: operation.id,
    })
    expect(findSchemaViolation(status.meta!.outputSchema!, mcp)).toBeNull()
    expect(JSON.parse(JSON.stringify(mcp))).toMatchObject(rest.body)
    await expect(
      status.function(admin)({
        source_id_or_slug: destination.id,
        operation_id: operation.id,
      }),
    ).rejects.toMatchObject({ status: 404 })
    await settleTopicMergeOperationForTest(admin, source.id, operation.id)
    const [completedRest, completedById, completedBySlug] = await Promise.all([
      request.get(operation.status_url).expect(200),
      status.function(admin)({ source_id_or_slug: source.id, operation_id: operation.id }),
      status.function(admin)({ source_id_or_slug: source.slug, operation_id: operation.id }),
    ])
    expect(completedRest.body.topic_merge).toMatchObject({
      id: operation.id,
      source_topic_id: source.id,
      destination_topic_id: destination.id,
      status: 'completed',
      completed_at: expect.any(String),
      error_code: null,
    })
    for (const result of [completedById, completedBySlug]) {
      expect(findSchemaViolation(status.meta!.outputSchema!, result)).toBeNull()
      expect(JSON.parse(JSON.stringify(result))).toEqual(completedRest.body)
    }
    const regular = await createTestUser()
    await expect(
      submit.function(regular)({
        source_id_or_slug: source.id,
        destination_id_or_slug: destination.id,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      status.function(regular)({
        source_id_or_slug: source.id,
        operation_id: operation.id,
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
})
