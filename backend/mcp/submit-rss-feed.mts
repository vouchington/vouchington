import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
import { assertWithinContributionActionLimit } from '@services/contribution-gating'
import { createSourceFromUrl, type CreateSourceResult } from '@services/rss-feeds/create-source'
import { parseCreateSourceBody } from '@services/rss-feeds/request-body'
import { createMergedTool, type MergedToolSource } from './create-merged-tool.mts'
import { requireActiveToolUser } from './private-user.mts'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { objectSchema } from './output-schema-shapes.mts'

type Args = { rss_feed_url: string; follow?: boolean }
const source: MergedToolSource<Args, CreateSourceResult> = {
  schema: {
    description:
      'Submit a feed URL, returning the existing feed when already submitted. Follow defaults to true.',
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
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    api: [{ method: 'POST', path: '/api/v1/rss-feeds' }],
    outputSchema: objectSchema({
      status: { enum: ['created', 'upvoted'] },
      rss_feed_id: { type: 'string', format: 'uuid' },
      topic_id: { type: 'string', format: 'uuid' },
      topic_slug: { type: 'string' },
    }),
  },
  function: currentUser => async (args, invocationContext) => {
    const user = await requireActiveToolUser(currentUser)
    getDelegatedToolAuthority(user, invocationContext)
    const body = parseCreateSourceBody(args)
    return createSourceFromUrl(user, getRequestContentProvenance(), body.rss_feed_url, {
      assertContributionLimit: () =>
        assertWithinContributionActionLimit(user, user.membership_plan ?? null, 'rss_feed'),
      follow: body.follow,
    })
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
