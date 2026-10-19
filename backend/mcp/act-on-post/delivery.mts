import {
  parseSendFollowersInput,
  preflightPostDistributionTarget,
  sendPostToFollowers,
  sharePostWithFollowers,
  type FollowerDistributionAccepted,
  type SendFollowersInput,
} from '@services/follower-distributions'
import { markRead, markUnread } from '@services/read-states'
import { assertPostReadStateTarget } from '@services/posts/authorization'
import type { MergedToolSource } from '../create-merged-tool.mts'
import { POST_TARGET_SCHEMA, postActionMeta } from './meta.mts'
import { getDelegatedToolAuthority } from '../delegated-authority.mts'
import {
  DISTRIBUTION_OUTPUT_SCHEMA,
  distributionParameters,
  enqueueDistributionOrMarkFailed,
} from '../follower-distribution/tool-support.mts'
import { requireActiveToolUser } from '../private-user.mts'
import { canonicalEntityIds, MISSING_REFERENCE_ID } from '../resolve-entity-reference.mts'
import { successSchema } from '../output-schema-shapes.mts'

type DistributionArgs = { id: string } & Partial<SendFollowersInput>

function distributionSource(
  send: boolean,
): MergedToolSource<DistributionArgs, FollowerDistributionAccepted> {
  return {
    schema: {
      description: send
        ? 'Send a post to all or selected current followers, at most once per day.'
        : 'Share a post with your followers, at most once per day.',
      parameters: distributionParameters('id', POST_TARGET_SCHEMA, send),
    },
    meta: postActionMeta(
      [{ method: 'POST', path: `/api/v1/posts/:idOrSlug/${send ? 'sends' : 'shares'}` }],
      DISTRIBUTION_OUTPUT_SCHEMA,
    ),
    function: currentUser => async (args, invocationContext) => {
      const user = await requireActiveToolUser(currentUser)
      getDelegatedToolAuthority(user, invocationContext)
      const { id, ...body } = args
      const resolvedBody = Array.isArray(body.recipient_user_ids)
        ? {
            ...body,
            recipient_user_ids: (await canonicalEntityIds('user', body.recipient_user_ids)).map(
              userId => userId ?? MISSING_REFERENCE_ID,
            ),
          }
        : body
      if (!send) return enqueueDistributionOrMarkFailed(await sharePostWithFollowers(user, id))
      await preflightPostDistributionTarget(user, 'post_send', id)
      return enqueueDistributionOrMarkFailed(
        await sendPostToFollowers(user, id, parseSendFollowersInput(resolvedBody)),
      )
    },
  }
}

export const sharePostSource = distributionSource(false)
export const sendPostSource = distributionSource(true)

function readStateSource(read: boolean): MergedToolSource<{ id: string }, { success: true }> {
  return {
    schema: {
      description: read ? 'Mark a post you can see read.' : 'Mark a post you can see unread.',
      parameters: {
        type: 'object',
        properties: { id: POST_TARGET_SCHEMA },
        required: ['id'],
      },
    },
    meta: postActionMeta(
      [{ method: read ? 'PUT' : 'DELETE', path: '/api/v1/posts/:id/read' }],
      successSchema({}),
    ),
    function: currentUser => async (args, invocationContext) => {
      const user = await requireActiveToolUser(currentUser)
      getDelegatedToolAuthority(user, invocationContext)
      await assertPostReadStateTarget(user, args.id)
      await (read ? markRead : markUnread)(user.id, 'post', args.id)
      return { success: true }
    },
  }
}

export const markPostReadSource = readStateSource(true)
export const markPostUnreadSource = readStateSource(false)
