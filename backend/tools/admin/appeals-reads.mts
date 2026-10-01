import type { ModerationAppealStatus } from '@services/moderation-appeals/config'
import assert from 'http-assert'
import { getModerationAppealById, MODERATION_APPEAL_STATUSES } from '@services/moderation-appeals'
import { listModerationAppealPage } from '@services/moderation-appeals/list-page'
import { createAdminTool, adminInput, PAGE_INPUT, UUID_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

const readAnnotations = { readOnlyHint: true, openWorldHint: false } as const
export const adminAppealsReadTools = [
  createAdminTool<{ status?: ModerationAppealStatus; limit?: number; after?: string }>({
    name: 'list_moderation_appeals',
    description: 'List staff appeals with scoped cursor pagination.',
    scope: 'moderation:read',
    api: { method: 'GET', path: '/api/v1/appeals' },
    parameters: adminInput({
      ...PAGE_INPUT,
      status: { type: 'string', enum: MODERATION_APPEAL_STATUSES },
    }),
    outputSchema: adminRouteOutputSchema({ method: 'GET', path: '/api/v1/appeals' }, 'staff'),
    annotations: readAnnotations,
    run: (_user, args) => listModerationAppealPage(args),
  }),
  createAdminTool<{ id: string }>({
    name: 'get_moderation_appeal',
    description: 'Read the full staff appeal projection.',
    scope: 'moderation:read',
    api: { method: 'GET', path: '/api/v1/appeals/:id' },
    parameters: adminInput({ id: UUID_INPUT }, ['id']),
    outputSchema: adminRouteOutputSchema({ method: 'GET', path: '/api/v1/appeals/:id' }, 'staff'),
    annotations: readAnnotations,
    run: async (_user, { id }) => {
      const appeal = await getModerationAppealById(id)
      assert(appeal, 404, 'Appeal not found')
      return { appeal }
    },
  }),
]
