import {
  rejectRssFeedItemCategory,
  unrejectRssFeedItemCategory,
  assignRssFeedItemCategoryToTopic,
} from '@services/rss-feed-items'
import { adminInput, createAdminTool, UUID_INPUT, TEXT_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'
const root = '/api/v1/rss-feed-categories'
const rejectApi = { method: 'POST', path: `${root}/rejections` } as const
const restoreApi = { method: 'DELETE', path: `${root}/rejections` } as const
const assignApi = { method: 'POST', path: `${root}/assignments` } as const
const annotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
}
const reject = createAdminTool<{ category_text: string }>({
  name: 'reject_rss_category',
  description: 'Reject an unmapped RSS category using the existing staff audit path.',
  scope: 'editorial:write',
  api: rejectApi,
  parameters: adminInput({ category_text: TEXT_INPUT }, ['category_text']),
  outputSchema: adminRouteOutputSchema(rejectApi),
  annotations,
  run: async (user, args) => {
    await rejectRssFeedItemCategory(user, args.category_text)
    return { ok: true }
  },
})
const restore = createAdminTool<{ category_text: string }>({
  name: 'restore_rss_category',
  description: 'Restore a rejected RSS category using the existing staff audit path.',
  scope: 'editorial:write',
  api: restoreApi,
  parameters: adminInput({ category_text: TEXT_INPUT }, ['category_text']),
  outputSchema: {
    type: 'object',
    properties: { success: { type: 'boolean' } },
    required: ['success'],
  },
  annotations,
  run: async (user, args) => {
    await unrejectRssFeedItemCategory(user, args.category_text)
    return { success: true }
  },
})
const assign = createAdminTool<{ category_text: string; topic_id: string }>({
  name: 'assign_rss_category_to_topic',
  description: 'Assign an RSS category to an existing topic using the staff audit path.',
  scope: 'editorial:write',
  api: assignApi,
  parameters: adminInput({ category_text: TEXT_INPUT, topic_id: UUID_INPUT }, [
    'category_text',
    'topic_id',
  ]),
  outputSchema: adminRouteOutputSchema(assignApi),
  annotations: { ...annotations, destructiveHint: true },
  run: (user, args) =>
    assignRssFeedItemCategoryToTopic(user, {
      categoryText: args.category_text,
      topicId: args.topic_id,
    }),
})
export const adminEditorialCategoryTools = [reject, restore, assign]
