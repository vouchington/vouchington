import type { PrivateUser } from '@voucha/types/entities/user'
import onError from '@modules/on-error'
import { currentUserCanEditTopicRecommendation } from './authorization.mts'
import type { TopicRecommendationPost, UpdateTopicRecommendationInput } from './types.mts'
import { assertValidTopicRecommendationInput } from './shared.mts'
import assert from 'http-assert'
import { getPostByAny } from '@services/posts'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueOnPostUpdated } from '@queues/entity-listeners/enqueues'
import {
  materializeTopicRecommendationInput,
  replaceTopicRecommendationHostnames,
} from './materialize-topic-recommendation.mts'
import { lockPostPublication, recordPostPublicationChange } from '@services/post-publication'

export async function updateTopicRecommendation(
  currentUser: PrivateUser,
  recommendation: TopicRecommendationPost,
  changes: UpdateTopicRecommendationInput,
): Promise<TopicRecommendationPost> {
  try {
    assert(currentUserCanEditTopicRecommendation(currentUser, recommendation), 403, 'Forbidden')
    assert(
      recommendation.topic_recommendation.status === 'pending',
      422,
      'Recommendation is no longer editable',
    )
    assertValidTopicRecommendationInput(changes)

    await using query = await beginTransaction()
    const options = { query }
    await lockPostPublication(query, recommendation.id)
    const lockedRecommendationQuery = await query(sql`/* updateTopicRecommendation */
        SELECT reviewed_at
          , topic_title
          , topic_slug
          , topic_markdown
          , aliases
          , hostname_id
          , primary_hostname.hostname AS topic_hostname
          , topic_type
          , example_referral_link
          , landing_page_urls
          , COALESCE((
              SELECT ARRAY_AGG(vuh.hostname ORDER BY vuh.hostname)
              FROM post_topic_recommendations_hostnames ptrh
              JOIN view_url_hostnames vuh ON vuh.id = ptrh.hostname_id
              WHERE ptrh.post_id = post_topic_recommendations.post_id
            ), '{}') AS hostnames
          , posts.title
          , posts.markdown
        FROM post_topic_recommendations
        JOIN posts ON posts.id = post_topic_recommendations.post_id
        LEFT JOIN view_url_hostnames primary_hostname
          ON primary_hostname.id = post_topic_recommendations.hostname_id
        WHERE post_id = ${recommendation.id}
        /* deadlock-safe: unique post_id lock is a single-row FOR UPDATE OF */
        FOR UPDATE OF post_topic_recommendations, posts
      `)
    const lockedRecommendation = lockedRecommendationQuery.rows[0]
    assert(lockedRecommendation?.reviewed_at === null, 422, 'Recommendation is no longer editable')

    // ast-grep-ignore: no-three-sequential-awaits -- service workflow has dependent validation, mutation, and follow-up side effects
    const materialized = await materializeTopicRecommendationInput(
      currentUser.id,
      {
        title: changes.title ?? (lockedRecommendation.title as string),
        markdown: changes.markdown ?? (lockedRecommendation.markdown as string),
        topic_title: changes.topic_title ?? (lockedRecommendation.topic_title as string),
        topic_slug: changes.topic_slug ?? (lockedRecommendation.topic_slug as string),
        topic_markdown:
          changes.topic_markdown ??
          (lockedRecommendation.topic_markdown as string | null) ??
          undefined,
        topic_hostname:
          changes.topic_hostname !== undefined
            ? changes.topic_hostname
            : ((lockedRecommendation.topic_hostname as string | null) ?? undefined),
        topic_hostnames:
          changes.topic_hostnames ??
          (lockedRecommendation.hostnames as string[] | null) ??
          undefined,
        topic_aliases:
          changes.topic_aliases ?? (lockedRecommendation.aliases as string[] | null) ?? undefined,
        topic_type:
          changes.topic_type ??
          (lockedRecommendation.topic_type as 'topic' | 'referral_program' | 'card' | null) ??
          undefined,
        example_referral_link:
          changes.example_referral_link !== undefined
            ? changes.example_referral_link
            : ((lockedRecommendation.example_referral_link as string | null) ?? undefined),
        landing_page_urls:
          changes.landing_page_urls ??
          (lockedRecommendation.landing_page_urls as string[] | null) ??
          undefined,
      },
      options,
    )

    await write(
      sql`/* updateTopicRecommendation */
          UPDATE posts
          SET title = ${materialized.title},
            markdown = ${materialized.markdown},
            updated_by_id = ${currentUser.id},
            bedrock_nova_multimodal_v1_content_sha256 = ${materialized.embedding_content_sha}
          WHERE id = ${recommendation.id}
        `,
      options,
    )

    const extensionResult = await write(
      sql`/* updateTopicRecommendation */
          UPDATE post_topic_recommendations
          SET topic_title = ${materialized.topic_title},
            topic_slug = ${materialized.topic_slug},
            topic_markdown = ${materialized.topic_markdown},
            aliases = ${materialized.topic_aliases},
            hostname_id = ${materialized.hostname_id},
            topic_type = ${materialized.topic_type ?? 'topic'},
            example_referral_link = ${materialized.example_referral_link ?? null},
            landing_page_urls = ${materialized.landing_page_urls ?? []},
            approval_error_message = NULL
          WHERE post_id = ${recommendation.id}
            AND reviewed_at IS NULL
        `,
      options,
    )
    assert(extensionResult.rowCount === 1, 422, 'Recommendation is no longer editable')

    // ast-grep-ignore: no-three-sequential-awaits -- hostname replacement, publication capture, and the transaction-consistent reload are ordered
    await replaceTopicRecommendationHostnames(recommendation.id, materialized.hostname_ids, options)
    await recordPostPublicationChange(query, {
      scope: { type: 'post', postId: recommendation.id },
      reason: 'post_updated',
    })

    const reloaded = await getPostByAny(recommendation.id, options)
    assert(
      reloaded?.post_type === 'topic_recommendation' && reloaded.topic_recommendation,
      500,
      'Failed to reload updated recommendation',
    )
    const updated = reloaded as TopicRecommendationPost
    await query.commit()

    void enqueueOnPostUpdated(recommendation.id)
    return updated
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    const extendedError = err as Error & {
      extra?: Record<string, unknown>
      tags?: Record<string, string | number | boolean>
    }
    extendedError.extra = {
      ...(extendedError.extra ?? {}),
      function: 'updateTopicRecommendation',
      recommendationId: recommendation.id,
      currentUserId: currentUser.id,
    }
    extendedError.tags = {
      ...(extendedError.tags ?? {}),
      area: 'topic-recommendations',
    }
    onError(err)
    throw error
  }
}
