import assert from 'http-assert'
import { assertNotSuspended } from '@services/users'
import { currentUserCanReviewCopyrightNotices } from '@services/copyright-notices/authorization'
import { readClaimantMisuseSummaryPage } from '@services/copyright-notices/claimant-misuse-summary'
import { adminInput, createAdminTool, UUID_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

const claimantMisuseApi = {
  method: 'GET',
  path: '/api/v1/copyright-notices/claimants/:claimantUserId/misuse-summary',
} as const
export const claimantMisuseSummary = createAdminTool<{ claimant_user_id: string; after?: string }>({
  name: 'get_copyright_claimant_misuse_summary',
  description:
    "Read a bounded latest-notice window of one claimant's copyright misuse evidence with an opaque continuation cursor.",
  scope: 'copyright-notices:read',
  api: claimantMisuseApi,
  parameters: adminInput({ claimant_user_id: UUID_INPUT, after: { type: 'string' } }, [
    'claimant_user_id',
  ]),
  outputSchema: adminRouteOutputSchema(claimantMisuseApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (user, args) => {
    assertNotSuspended(user)
    assert(currentUserCanReviewCopyrightNotices(user), 403, 'Copyright review staff required')
    return {
      claimant_misuse: await readClaimantMisuseSummaryPage(args.claimant_user_id, args.after),
    }
  },
})
