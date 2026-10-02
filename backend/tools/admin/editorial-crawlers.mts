import {
  getCrawlersForHostname,
  getCrawlersByReferralProgramId,
  getCrawlerByIdForUser,
  updateCrawlerForUser,
  upsertCrawlerForReferralProgram,
  searchCrawlers,
  type UpdateCrawlerUpdates,
} from '@services/crawlers'
import { adminInput, createAdminTool, PAGE_INPUT, UUID_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

const selectors = { type: 'array', items: { type: 'string', maxLength: 2000 }, maxItems: 100 }
const updates = {
  hostname_id: UUID_INPUT,
  description: { type: 'string', maxLength: 2000 },
  crawler_type: { type: 'string', enum: ['fetch', 'automation'] },
  priority: { type: 'integer' },
  css_selectors_to_remove: selectors,
  link_text_content_to_remove: selectors,
  link_hrefs_to_remove: selectors,
  content_selectors: selectors,
  referral_program_id: { anyOf: [UUID_INPUT, { type: 'null' }] },
}
const listApi = { method: 'GET', path: '/api/v1/crawlers' } as const
const list = createAdminTool<{
  hostname_id?: string
  referral_program_id?: string
  after?: string
  limit?: number
}>({
  name: 'list_crawlers',
  description:
    'Read a bounded page of crawlers, optionally filtered by hostname or referral program.',
  scope: 'editorial:read',
  api: listApi,
  parameters: adminInput({
    ...PAGE_INPUT,
    hostname_id: UUID_INPUT,
    referral_program_id: UUID_INPUT,
  }),
  outputSchema: adminRouteOutputSchema(listApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (_, args) => {
    if (args.referral_program_id)
      return { results: await getCrawlersByReferralProgramId(args.referral_program_id) }
    if (args.hostname_id) return { results: await getCrawlersForHostname(args.hostname_id) }
    return searchCrawlers(args)
  },
})
const getApi = { method: 'GET', path: '/api/v1/crawlers/{id}' } as const
const get = createAdminTool<{ id: string }>({
  name: 'get_crawler',
  description: 'Read one crawler.',
  scope: 'editorial:read',
  api: getApi,
  parameters: adminInput({ id: UUID_INPUT }, ['id']),
  outputSchema: adminRouteOutputSchema(getApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (user, args) => ({ crawler: await getCrawlerByIdForUser(user, args.id) }),
})
const updateApi = { method: 'PATCH', path: '/api/v1/crawlers/{id}' } as const
const update = createAdminTool<{ id: string; updates: UpdateCrawlerUpdates }>({
  name: 'update_crawler',
  description: 'Update a crawler through the staff validation and audit path.',
  scope: 'editorial:write',
  api: updateApi,
  parameters: adminInput({ id: UUID_INPUT, updates: adminInput(updates) }, ['id', 'updates']),
  outputSchema: adminRouteOutputSchema(updateApi),
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  run: async (user, args) => ({ crawler: await updateCrawlerForUser(user, args.id, args.updates) }),
})
const referralApi = { method: 'PUT', path: '/api/v1/crawlers/referral-program' } as const
const referral = createAdminTool<{
  hostname_id: string
  referral_program_id: string
  crawler_type?: 'fetch' | 'automation'
  css_selectors_to_remove?: string[]
  content_selectors?: string[]
}>({
  name: 'set_referral_program_crawler',
  description: 'Create or update the crawler for a hostname and referral program.',
  scope: 'editorial:write',
  api: referralApi,
  parameters: adminInput(
    {
      hostname_id: UUID_INPUT,
      referral_program_id: UUID_INPUT,
      crawler_type: updates.crawler_type,
      css_selectors_to_remove: selectors,
      content_selectors: selectors,
    },
    ['hostname_id', 'referral_program_id'],
  ),
  outputSchema: adminRouteOutputSchema(referralApi),
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  run: async (user, args) => ({
    crawler: await upsertCrawlerForReferralProgram(
      user,
      args.hostname_id,
      args.referral_program_id,
      args,
    ),
  }),
})
export const adminEditorialCrawlerTools = [list, get, update, referral]
