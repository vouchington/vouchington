import assert from 'http-assert'
import { importAdminTopics } from '@services/admin-imports/topic-import'
import { startAdminArticleSync } from '@services/admin-imports/article-sync-controls'
import { adminInput, createAdminTool } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

const importApi = { method: 'POST', path: '/api/v1/imports/topics' } as const
const topics = createAdminTool<{ csv: string }>({
  name: 'import_topics',
  description: 'Validate a bounded topic CSV and enqueue its import batch.',
  scope: 'editorial:write',
  api: importApi,
  parameters: adminInput({ csv: { type: 'string', minLength: 1, maxLength: 4 * 1024 * 1024 } }, [
    'csv',
  ]),
  outputSchema: {
    type: 'object',
    properties: {
      valid: { type: 'boolean', const: true },
      batch: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          import_type: { type: 'string', enum: ['topic'] },
          total_rows: { type: 'integer', minimum: 1, maximum: 1000 },
          created_at: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'import_type', 'total_rows', 'created_at'],
      },
    },
    required: ['valid', 'batch'],
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  run: async (user, args) => {
    const result = await importAdminTopics(user, args.csv)
    assert(result.valid, 422, 'error' in result ? result.error : 'Invalid topic rows')
    return result
  },
})
const syncApi = { method: 'POST', path: '/api/v1/article-syncs' } as const
const sync = createAdminTool<Record<string, never>>({
  name: 'start_article_sync',
  description: 'Start an article sync, rejecting a recently triggered sync.',
  scope: 'editorial:write',
  api: syncApi,
  parameters: adminInput({}),
  outputSchema: adminRouteOutputSchema(syncApi),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  run: user => startAdminArticleSync(user),
})
export const adminEditorialImportTools = [topics, sync]
