import assert from 'http-assert'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
import {
  admitDelegatedContribution,
  executePreparedContribution,
} from '@services/contribution-gating'
import { prepareLinkPost, type Post } from '@services/posts'
import {
  currentUserCanCreatePost,
  getAuthorizedPostContributionMembershipPlan,
} from '@services/posts/authorization'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import {
  assertStoryIsDiscoverable,
  currentUserCanCreateStoryPost,
} from '@services/stories/authorization'
import { prepareStoryPost, type StoryPostResult } from '@services/stories/story-posts'
import { createMergedTool, type MergedToolSource } from './create-merged-tool.mts'
import { requireActiveToolUser } from './private-user.mts'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { POST_WRITE_RESULT_SCHEMA, POST_WRITE_SCOPES } from './post-write-tool-support.mts'
import { toWrittenMcpPost, type McpPost } from './mcp-post-output.mts'

type Args = { rss_feed_item_id?: string; story_id?: string; idempotency_key: string }
function source(story: boolean): MergedToolSource<Args, { success: true; post: McpPost }> {
  const idKey = story ? 'story_id' : 'rss_feed_item_id'
  return {
    schema: {
      description: `${story ? 'Start a discussion from a discoverable story.' : 'Start a link discussion from an RSS item.'} Reuse the UUID idempotency_key with the same input to retry safely.`,
      parameters: {
        type: 'object',
        properties: {
          [idKey]: { type: 'string', format: 'uuid' },
          idempotency_key: { type: 'string', format: 'uuid' },
        },
        required: [idKey, 'idempotency_key'],
      },
    },
    meta: {
      audience: 'user',
      title: 'Start Discussion',
      plan: 'plus',
      requiredScopes: POST_WRITE_SCOPES,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      api: [
        {
          method: 'POST',
          path: story
            ? '/api/v1/stories/:storyId/discussions'
            : '/api/v1/rss-feed-items/:id/discussions',
        },
      ],
      outputSchema: POST_WRITE_RESULT_SCHEMA,
    },
    function: currentUser => async (args, invocationContext) => {
      const user = await requireActiveToolUser(currentUser)
      const authority = getDelegatedToolAuthority(user, invocationContext)
      assert(
        story ? currentUserCanCreateStoryPost(user) : currentUserCanCreatePost(user),
        403,
        'Forbidden',
      )
      const membershipPlan = await getAuthorizedPostContributionMembershipPlan(user)
      const id = args[idKey]!
      let item: NonNullable<Awaited<ReturnType<typeof getRssFeedItemById>>> | undefined
      const admitted = await admitDelegatedContribution<Post | StoryPostResult>({
        authority,
        currentUser: user,
        membershipPlan,
        source: story ? 'story' : 'rss_item_discussion',
        scope: story ? `story:${id}` : `rss_item:${id}`,
        postType: story ? 'story' : 'link',
        idempotencyKey: args.idempotency_key,
        intent: story
          ? { route: 'stories.discussions.create', story_id: id }
          : { route: 'rss-feed-items.discussions.create', rss_feed_item_id: id },
        ...(story
          ? { beforeCommit: () => assertStoryIsDiscoverable(id) }
          : {
              beforeCapacity: async () => {
                const resolved = await getRssFeedItemById(id, { readOnly: false })
                assert(resolved, 404, 'RSS feed item not found')
                item = resolved
              },
            }),
        execute: query =>
          executePreparedContribution<Post | StoryPostResult>(query, async () => {
            if (story) return prepareStoryPost(id, user, { query })
            if (!item) throw new Error('RSS feed item admission precondition was not executed')
            const prepared = await prepareLinkPost(
              user,
              getRequestContentProvenance(),
              { url_id: item.url.id, title: item.data.title },
              { query },
            )
            return {
              response: prepared.response.post,
              finalize: async () => (await prepared.finalize()).post,
            }
          }),
      })
      const post = 'post' in admitted ? admitted.post : admitted
      return { success: true, post: await toWrittenMcpPost(post) }
    },
  }
}
export const startDiscussionGroup = {
  name: 'start_discussion',
  options: [
    { option: 'rss_feed_item', source: source(false) },
    { option: 'story', source: source(true) },
  ],
} as const
export default createMergedTool(
  startDiscussionGroup.name,
  'Start Discussion',
  startDiscussionGroup.options,
)
