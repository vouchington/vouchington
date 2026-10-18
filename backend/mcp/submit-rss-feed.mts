import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
import { submitRssFeedSource } from '@services/user-import-export/submit-rss-feed-source'
import { parseCreateSourceBody } from '@services/rss-feeds/request-body'
import { createMergedTool, type MergedToolSource } from './create-merged-tool.mts'
import { requireActiveToolUser } from './private-user.mts'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { routeResponseSchema } from './route-response-schema.mts'

type Args = { rss_feed_url: string; follow?: boolean }
const source: MergedToolSource<Args, Awaited<ReturnType<typeof submitRssFeedSource>>> = {
  schema: {
    description:
      'Submit a feed URL for asynchronous processing. Poll status_url for the result. Follow defaults to true.',
    parameters: {
      type: 'object',
      properties: { rss_feed_url: { type: 'string' }, follow: { type: 'boolean' } },
      required: ['rss_feed_url'],
    },
  },
  meta: {
    audience: 'user',
    title: 'Submit RSS Feed',
    plan: 'plus',
    requiredScopes: ['rss-feeds:read', 'rss-feeds:write'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    api: [{ method: 'POST', path: '/api/v1/rss-feeds' }],
    outputSchema: routeResponseSchema({ method: 'POST', path: '/api/v1/rss-feeds' }),
  },
  function: currentUser => async (args, invocationContext) => {
    const user = await requireActiveToolUser(currentUser)
    getDelegatedToolAuthority(user, invocationContext)
    const body = parseCreateSourceBody(args)
    return submitRssFeedSource(user, getRequestContentProvenance(), body.rss_feed_url, body.follow)
  },
}
export const submitRssFeedGroup = {
  name: 'submit_rss_feed',
  options: [{ option: 'submit', source }],
} as const
export default createMergedTool(
  submitRssFeedGroup.name,
  'Submit RSS Feed',
  submitRssFeedGroup.options,
)
