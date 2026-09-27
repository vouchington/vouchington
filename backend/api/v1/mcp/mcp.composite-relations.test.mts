import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestMembership,
  createTestTopic,
  createTestUserWithAge,
  getEntityRelation,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { createApiKey } from '@services/api-keys'

describe('POST /api/v1/mcp composite relations', () => {
  it('returns the canonical tuple without relation_id for a community mute topic', async () => {
    const owner = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    await createTestMembership({ user_id: owner.id, plan: 'plus' })
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const topic = await createTestTopic({ user: owner })
    const { rawKey } = await createApiKey(owner.id, 'mcp', 'Community mute MCP Key', [
      'entity-relations:read',
      'entity-relations:write',
    ])

    const response = await createRequest()
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${rawKey}`)
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'add_entity_relation',
          arguments: {
            action: 'add_relation',
            entity_type: 'community',
            entity_id: community.id,
            predicate: 'mute',
            object_type: 'topic',
            object_id: topic.id,
          },
        },
      })
      .expect(200)

    const body = response.body as {
      result?: { content?: Array<{ text?: string }>; isError?: boolean }
    }
    expect(body.result?.isError).not.toBe(true)
    expect(JSON.parse(body.result?.content?.[0]?.text ?? '{}')).toEqual({
      subject_type: 'community',
      subject_id: community.id,
      predicate: 'mute',
      object_type: 'topic',
      object_id: topic.id,
    })
    expect(
      await getEntityRelation('relation__community__mute__topic', community.id, topic.id),
    ).toHaveLength(1)
  })
})
