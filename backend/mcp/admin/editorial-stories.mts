import assert from 'http-assert'
import getStoryTool from '../get-story.mts'
import {
  addEditorialStoryItem,
  removeEditorialStoryItem,
  setEditorialStoryOfficialItem,
  renameEditorialStory,
} from '@services/stories'
import { adminInput, createAdminTool, UUID_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

const root = '/api/v1/stories/{storyId}'
const writes = { readOnlyHint: false, idempotentHint: false, openWorldHint: false }
const itemInput = adminInput({ story_id: UUID_INPUT, item_id: UUID_INPUT }, ['story_id', 'item_id'])
const okSchema: import('@services/openai-agents/tool-types').ToolOutputSchema = {
  type: 'object',
  properties: { success: { type: 'boolean' } },
  required: ['success'],
}
const read = createAdminTool<{
  story_id: string
  limit?: number
  after?: string
  exclude_item_id?: string
}>({
  name: 'get_editorial_story',
  description: 'Read a news story and one bounded page of its articles for editorial review.',
  scope: 'editorial:read',
  api: { method: 'GET', path: '/api/v1/stories/{id}' },
  parameters: adminInput(
    {
      story_id: UUID_INPUT,
      limit: { type: 'integer', minimum: 1, maximum: 25 },
      after: { type: 'string', maxLength: 2000 },
      exclude_item_id: UUID_INPUT,
    },
    ['story_id'],
  ),
  outputSchema: getStoryTool.meta!.outputSchema!,
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (user, args) => {
    const result = await getStoryTool.function(user)(args)
    assert(
      result.success,
      result.success || result.error === 'Story not found' ? 404 : 400,
      result.success ? '' : result.error,
    )
    return result
  },
})
const add = createAdminTool<{ story_id: string; item_id: string }>({
  name: 'add_story_item',
  description: 'Assign an article to a story and lock the assignment with staff history.',
  scope: 'editorial:write',
  api: { method: 'PUT', path: `${root}/items/{itemId}` },
  parameters: itemInput,
  outputSchema: okSchema,
  annotations: { ...writes, destructiveHint: false },
  run: async (user, args) => {
    await addEditorialStoryItem(user, args.story_id, args.item_id)
    return { success: true }
  },
})
const remove = createAdminTool<{ story_id: string; item_id: string }>({
  name: 'remove_story_item',
  description:
    'Remove an article from its story and lock it against reassignment with staff history.',
  scope: 'editorial:write',
  api: { method: 'DELETE', path: `${root}/items/{itemId}` },
  parameters: itemInput,
  outputSchema: okSchema,
  annotations: { ...writes, destructiveHint: true },
  run: async (user, args) => {
    await removeEditorialStoryItem(user, args.story_id, args.item_id)
    return { success: true }
  },
})
const officialApi = { method: 'PUT', path: `${root}/official` } as const
const official = createAdminTool<{ story_id: string; item_id: string }>({
  name: 'set_story_official_item',
  description: 'Set and lock the official article for a story with staff history.',
  scope: 'editorial:write',
  api: officialApi,
  parameters: itemInput,
  outputSchema: adminRouteOutputSchema(officialApi),
  annotations: { ...writes, destructiveHint: true },
  run: (user, args) => setEditorialStoryOfficialItem(user, args.story_id, args.item_id),
})
const renameApi = { method: 'PATCH', path: '/api/v1/stories/{id}' } as const
const rename = createAdminTool<{ story_id: string; title: string }>({
  name: 'rename_story',
  description: 'Rename a news story with staff history.',
  scope: 'editorial:write',
  api: renameApi,
  parameters: adminInput(
    { story_id: UUID_INPUT, title: { type: 'string', minLength: 1, maxLength: 500 } },
    ['story_id', 'title'],
  ),
  outputSchema: adminRouteOutputSchema(renameApi),
  annotations: { ...writes, destructiveHint: true },
  run: (user, args) => renameEditorialStory(user, args.story_id, args.title),
})
export const adminEditorialStoryTools = [read, add, remove, official, rename]
