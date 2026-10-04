import { getPaginationLimitsForContract } from '@services/pagination'
import assert from 'http-assert'
import { assertNotSuspended } from '@services/users'
import {
  getCopyrightPublicNoticeDetail,
  listCopyrightRepeatInfringerAccountsForNotice,
} from '@services/copyright-notices'
import {
  copyrightStaffQueueParser,
  listCopyrightStaffQueuePage,
} from '@services/copyright-notices/staff-queue-page'
import { adminInput, createAdminTool, PAGE_INPUT, UUID_INPUT } from './create-admin-tool.mts'
import { redactCopyrightContactFields, redactCopyrightQueueCase } from './copyright-redaction.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

const queueApi = { method: 'GET', path: '/api/v1/copyright-notices/review-queue' } as const
const reviewQueue = createAdminTool<{ after?: string; limit?: number }>({
  name: 'list_copyright_review_queue',
  description: 'List actionable copyright cases by urgency with opaque continuation cursors.',
  scope: 'copyright-notices:read',
  api: queueApi,
  parameters: adminInput(PAGE_INPUT),
  outputSchema: adminRouteOutputSchema(queueApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (user, args) => {
    const page = await listCopyrightStaffQueuePage(
      user,
      copyrightStaffQueueParser.parse(
        args,
        getPaginationLimitsForContract(copyrightStaffQueueParser.queryContract),
      ),
    )
    return redactCopyrightContactFields({
      ...page,
      copyright_notices: page.copyright_notices.map(redactCopyrightQueueCase),
    })
  },
})
const noticeApi = { method: 'GET', path: '/api/v1/copyright-notices/:id' } as const
const notice = createAdminTool<{ id: string }>({
  name: 'get_copyright_notice',
  description: 'Read the current public copyright notice projection.',
  scope: 'copyright-notices:read',
  api: noticeApi,
  parameters: adminInput({ id: UUID_INPUT }, ['id']),
  outputSchema: adminRouteOutputSchema(noticeApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (_, args) => {
    const copyright_notice = await getCopyrightPublicNoticeDetail(args.id)
    assert(copyright_notice, 404, 'Copyright notice not found')
    return redactCopyrightContactFields({ copyright_notice })
  },
})
const repeatApi = {
  method: 'GET',
  path: '/api/v1/copyright-notices/:id/repeat-infringer-accounts',
} as const
const repeatAccounts = createAdminTool<{ id: string }>({
  name: 'list_repeat_infringer_accounts',
  description: 'List repeat-infringer accounts attached to one copyright notice.',
  scope: 'copyright-notices:read',
  api: repeatApi,
  parameters: adminInput({ id: UUID_INPUT }, ['id']),
  outputSchema: adminRouteOutputSchema(repeatApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (user, args) => {
    assertNotSuspended(user)
    return redactCopyrightContactFields({
      copyright_repeat_infringer_accounts: await listCopyrightRepeatInfringerAccountsForNotice(
        user,
        args.id,
      ),
    })
  },
})
export const adminLegalTools = [reviewQueue, notice, repeatAccounts]
