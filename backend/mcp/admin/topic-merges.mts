import assert from 'http-assert'
import {
  createTopicMergeOperation,
  getTopicMergeOperation,
  getTopicByAnyWithRedirect,
  getTopicsByAnyWithRedirectBatch,
} from '@services/topics'
import { adminInput, createAdminTool, TEXT_INPUT, UUID_INPUT } from './create-admin-tool.mts'
import type { ToolOutputSchema } from '@services/openai-agents/tool-types'

const outputSchema: ToolOutputSchema = {
  type: 'object',
  properties: {
    topic_merge: {
      type: 'object',
      properties: {
        id: UUID_INPUT,
        source_topic_id: UUID_INPUT,
        destination_topic_id: UUID_INPUT,
        status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed'] },
        stage: { type: 'string' },
        created_at: { type: 'string' },
        completed_at: { type: ['string', 'null'] },
        error_code: { type: ['string', 'null'] },
        status_url: { type: 'string' },
      },
      required: [
        'id',
        'source_topic_id',
        'destination_topic_id',
        'status',
        'stage',
        'created_at',
        'completed_at',
        'error_code',
        'status_url',
      ],
      additionalProperties: false,
    },
  },
  required: ['topic_merge'],
  additionalProperties: false,
}

const submit = createAdminTool<{ source_id_or_slug: string; destination_id_or_slug: string }>({
  name: 'merge_topic',
  description:
    'Queue a topic merge. Returns a pending operation, not a completed merge. Read get_topic_merge with the source and operation ID until completed or failed. Participants cannot be edited while the merge runs.',
  scope: 'editorial:write',
  api: { method: 'POST', path: '/api/v1/topics/:sourceIdOrSlug/merges' },
  parameters: adminInput({ source_id_or_slug: TEXT_INPUT, destination_id_or_slug: TEXT_INPUT }, [
    'source_id_or_slug',
    'destination_id_or_slug',
  ]),
  outputSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  run: async (user, args) => {
    const [source, destination] = await getTopicsByAnyWithRedirectBatch([
      args.source_id_or_slug,
      args.destination_id_or_slug,
    ])
    assert(source, 404, 'Source topic not found')
    assert(!source.topic_redirect, 409, 'Source topic has already been merged')
    assert(destination, 404, 'Destination topic not found')
    assert(!destination.topic_redirect, 409, 'Destination topic has already been merged')
    const operation = await createTopicMergeOperation(user, source.topic, destination.topic)
    return {
      topic_merge: {
        ...operation,
        created_at: operation.created_at.toISOString(),
        completed_at: operation.completed_at?.toISOString() ?? null,
        status_url: `/api/v1/topics/${operation.source_topic_id}/merges/${operation.id}`,
      },
    }
  },
})

const status = createAdminTool<{ source_id_or_slug: string; operation_id: string }>({
  name: 'get_topic_merge',
  description:
    'Read an admitted topic merge operation. queued and running are pending; completed means all stages finished; failed reports a preflight rejection in error_code. Uses the same operation and status fields as REST.',
  scope: 'editorial:read',
  api: { method: 'GET', path: '/api/v1/topics/:sourceIdOrSlug/merges/:operationId' },
  parameters: adminInput({ source_id_or_slug: TEXT_INPUT, operation_id: UUID_INPUT }, [
    'source_id_or_slug',
    'operation_id',
  ]),
  outputSchema,
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (user, args) => {
    const source = await getTopicByAnyWithRedirect(args.source_id_or_slug)
    assert(source, 404, 'Source topic not found')
    const sourceId = source.topic_redirect?.source_topic_id ?? source.topic.id
    const operation = await getTopicMergeOperation(user, sourceId, args.operation_id)
    assert(operation, 404, 'Topic merge operation not found')
    return {
      topic_merge: {
        ...operation,
        created_at: operation.created_at.toISOString(),
        completed_at: operation.completed_at?.toISOString() ?? null,
        status_url: `/api/v1/topics/${operation.source_topic_id}/merges/${operation.id}`,
      },
    }
  },
})

export const adminTopicMergeTools = [submit, status]
