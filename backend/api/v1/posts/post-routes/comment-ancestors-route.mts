import type { Context } from '@jongleberry/api-server'
import { getPostElectionVote, upsertPostElectionVotes } from '@services/elections-votes/post'
import { getPostByAnyCached } from '@services/entity-fetch'
import { canViewPost, type Post } from '@services/posts'
import { enqueueDistributeActivity } from '@queues/activitypub-delivery/enqueues'
import onError from '@modules/on-error'
import app from '../../../app.mts'
import {
  createVoteClearHandler,
  createVoteHandler,
  type CreateVoteHandlerOptions,
} from '../../../election-vote-handler.mts'
import {
  createVoteStatsNoopReconciler,
  type ElectionVoteMutationResult,
} from '@services/elections-votes/shared'
import type { ElectionVoteRequest } from '@voucha/types/entities/election'
import { enqueueBulkUpdatePostElectionVoteStats } from '@queues/elections/enqueues'
import { getRouteAccessPost } from '../get-route-access-post.mts'
import {
  apiNoRequestBody,
  apiOpenApiNoContent,
  apiRequestContract,
} from '../../../response-contract.mts'

const postVoteOptions: CreateVoteHandlerOptions<ElectionVoteMutationResult> = {
  rateLimitPrefix: 'post-election-vote',
  routeKey: 'PUT:/api/v1/posts/:id/vote',
  requestContractOperation: 'PUT:/api/v1/posts/:id/vote',
  entityType: 'post',
  // Vote policy belongs to the actual target: a comment beneath a topic recommendation still
  // uses the ordinary sentiment ballot. Route access below deliberately resolves its root.
  getEntity: getPostByAnyCached,
  entityNotFoundMessage: 'Post not found',
  votePolicy: entity =>
    (entity as Post).post_type === 'topic_recommendation' ? 'recommendation' : 'sentiment',
  upsertVotes: upsertPostElectionVotes,
  getCurrentVote: getPostElectionVote,
  onNoop: createVoteStatsNoopReconciler(enqueueBulkUpdatePostElectionVoteStats),
  assertAccess: async (ctx: Context, currentUser, entity) => {
    const targetPost = entity as Post
    // Topic recommendations are directly voteable despite being blocked from ordinary post-route
    // access. A comment beneath one inherits that root's access, while keeping its own policy.
    const routeAccessPost =
      targetPost.post_type === 'topic_recommendation'
        ? targetPost
        : await getRouteAccessPost(targetPost)
    const commentRecommendationRoot =
      routeAccessPost === null && targetPost.root_id
        ? await getPostByAnyCached(targetPost.root_id)
        : null
    const accessPost =
      commentRecommendationRoot?.post_type === 'topic_recommendation'
        ? commentRecommendationRoot
        : routeAccessPost
    ctx.assert(
      accessPost &&
        (await canViewPost(currentUser, targetPost)) &&
        (await canViewPost(currentUser, accessPost)),
      404,
      'Post not found',
    )
  },
  // Outbound federation (Phase C4): any positive semantic choice maps to AS2 Like; Neutral,
  // negative choices, and Clear map to the absence of a Like. Fire-and-forget — this callback is
  // itself awaited by election-vote-handler.mts, so it must never block the vote response on
  // outbound delivery enqueueing. Only a transition across the positive/non-positive boundary
  // emits Like or Undo(Like); changing strength within the same sign does not federate again.
  onVote: async (currentUser, entityId, score, _entity, previousScore, vote) => {
    const wasLike = previousScore !== null && previousScore > 0
    const isLike = score !== null && score > 0
    if (wasLike === isLike) return
    // Only federate votes on posts that are genuinely public — canViewPost(currentUser, ...) is
    // an access check for the specific voter, not whether the post is visible to arbitrary
    // remote followers. canViewPost(null, ...) is the anonymous-viewer check that gates every
    // other anonymous read (see dispatch-activity.mts's resolveLikeTargetPostId for the same
    // pattern on the inbound side); without it, voting on a private/community-scoped/unapproved
    // post would leak the post's AP URI and vote state to that voter's remote followers.
    //
    // Re-fetch by entityId rather than trusting `entity`: getRouteAccessPost swaps a comment for
    // its root post for route-access purposes, so `entity` here can be the ROOT, not the actual
    // voted post. The federated Like/UndoLike below targets entityId (the comment), so the
    // visibility gate must apply to that same post's own clearance_status/privacy — a comment can
    // be non-public (e.g. pending moderation) while its root is fully public (round-3 re-review
    // follow-up).
    //
    // Comments are unconditionally created with privacy='public'/broadcast='everyone'
    // (getAudienceDefaults), regardless of their root's actual settings. getRouteAccessPost keeps
    // the candidate after validating route type, while canViewPost evaluates candidate and root
    // current state together.
    //
    // This whole block runs after upsertVotes has already committed, and election-vote-handler.mts
    // awaits onVote with no surrounding try/catch — so an uncaught error here (a transient cache or
    // DB blip in the re-fetch/visibility check) would 500 the response even though the vote itself
    // succeeded. Fail closed: log and skip the federation side effect rather than fail the request.
    try {
      const votedPost = await getPostByAnyCached(entityId)
      if (!votedPost || !(await canViewPost(null, votedPost))) return
      const rootPost = await getRouteAccessPost(votedPost)
      if (!rootPost || !(await canViewPost(null, rootPost))) return
      if (!vote.id) throw new Error('Post vote event is missing its durable identity')
      const activityId = isLike ? vote.outbound_ap_like_activity_id : vote.id
      const originalActivityId = vote.previous_outbound_ap_like_activity_id
      if (!activityId) throw new Error('Post Like is missing its durable activity identity')
      // A pre-identity Like cannot be linked to the activity that was actually delivered.
      // Quietly preserve that unknown state instead of emitting an invalid Undo or logging a
      // post-commit error for an otherwise successful vote mutation.
      if (!isLike && !originalActivityId) return
      void enqueueDistributeActivity({
        ...(isLike
          ? {
              activityId,
              activityType: 'Like' as const,
              sourceUserId: currentUser.id,
              targetPostId: entityId,
            }
          : {
              activityId,
              activityType: 'UndoLike' as const,
              originalActivityId: originalActivityId!,
              sourceUserId: currentUser.id,
              targetPostId: entityId,
            }),
      })
    } catch (err) {
      onError(err as Error)
    }
  },
}

const postVoteHandler = createVoteHandler(postVoteOptions)

const clearPostVoteHandler = createVoteClearHandler({
  ...postVoteOptions,
  routeKey: 'DELETE:/api/v1/posts/:id/vote',
  requestContractOperation: 'DELETE:/api/v1/posts/:id/vote',
})

app.route('/api/v1/posts/:id/vote').put(async ctx => {
  apiRequestContract<
    'PUT:/api/v1/posts/:id/vote',
    ElectionVoteRequest<'sentiment' | 'recommendation'>
  >('PUT:/api/v1/posts/:id/vote')
  apiOpenApiNoContent('PUT:/api/v1/posts/:id/vote', 204)
  await postVoteHandler(ctx)
})

app.route('/api/v1/posts/:id/vote').delete(async ctx => {
  apiNoRequestBody('DELETE:/api/v1/posts/:id/vote')
  apiOpenApiNoContent('DELETE:/api/v1/posts/:id/vote', 204)
  await clearPostVoteHandler(ctx)
})
