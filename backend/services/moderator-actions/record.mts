import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { ModeratorActionType } from './config.mts'
import {
  flattenRestrictions,
  flattenSlugs,
  moderatorActionMetadataFacts,
} from './metadata-facts.mts'

export interface RecordModeratorActionInput {
  actionType: ModeratorActionType
  communityId?: string | null
  postId?: string | null
  targetUserId?: string | null
  reportId?: string | null
  reviewDisputeId?: string | null
  moderationAppealId?: string | null
  communityApplicationId?: string | null
  reason?: string | null
  metadata?: Record<string, unknown>
}

export async function recordModeratorAction(
  actorId: string | null,
  input: RecordModeratorActionInput,
  options?: QueryOptions,
): Promise<void> {
  const facts = moderatorActionMetadataFacts(input.metadata)
  await write(
    sql`/* recordModeratorAction */
      WITH inserted AS (
        INSERT INTO moderator_actions (
          actor_id, action_type, community_id, post_id, target_user_id,
          report_id, review_dispute_id, moderation_appeal_id, community_application_id, reason,
          metadata_role, metadata_previous_role, metadata_expires_at, metadata_expires_at_present,
          metadata_reason, metadata_image_id, metadata_source_key, metadata_moderation_training
        ) VALUES (
          ${actorId},
          ${input.actionType},
          ${input.communityId ?? null},
          ${input.postId ?? null},
          ${input.targetUserId ?? null},
          ${input.reportId ?? null},
          ${input.reviewDisputeId ?? null},
          ${input.moderationAppealId ?? null},
          ${input.communityApplicationId ?? null},
          ${input.reason ?? null},
          ${facts.role},
          ${facts.previousRole},
          ${facts.expiresAt},
          ${facts.expiresAtPresent},
          ${facts.reason},
          ${facts.imageId},
          ${facts.sourceKey},
          ${facts.moderationTraining}
        )
        RETURNING id
      ),
      slugs AS (
        INSERT INTO moderator_action_topic_slugs (action_id, position, topic_slug)
        SELECT inserted.id, slug.position::integer - 1, slug.topic_slug
        FROM inserted
        CROSS JOIN UNNEST(${facts.topicSlugs}::text[]) WITH ORDINALITY AS slug(topic_slug, position)
        RETURNING action_id
      ),
      restrictions AS (
        INSERT INTO moderator_action_restrictions (
          action_id, position, restriction_id, restriction_type
        )
        SELECT
          inserted.id,
          item.position::integer - 1,
          item.restriction_id,
          item.restriction_type::community_restriction_types
        FROM inserted
        CROSS JOIN UNNEST(
          ${facts.restrictions.map(item => item.id)}::uuid[],
          ${facts.restrictions.map(item => item.type)}::text[]
        ) WITH ORDINALITY AS item(restriction_id, restriction_type, position)
        RETURNING action_id
      )
      SELECT inserted.id
      FROM inserted
      LEFT JOIN LATERAL (SELECT count(*) AS n FROM slugs) slug_count ON true
      LEFT JOIN LATERAL (SELECT count(*) AS n FROM restrictions) restriction_count ON true
    `,
    options,
  )
}

export async function recordModeratorActions(
  actorId: string | null,
  inputs: RecordModeratorActionInput[],
  options?: QueryOptions,
): Promise<void> {
  if (inputs.length === 0) return
  const facts = inputs.map(input => moderatorActionMetadataFacts(input.metadata))
  const slugs = flattenSlugs(facts)
  const restrictions = flattenRestrictions(facts)
  await write(
    sql`/* recordModeratorActions */
      WITH raw AS (
        SELECT uuidv7() AS id, input.*
        FROM UNNEST(
          ${inputs.map(input => input.actionType)}::moderator_action_types[],
          ${inputs.map(input => input.communityId ?? null)}::uuid[],
          ${inputs.map(input => input.postId ?? null)}::uuid[],
          ${inputs.map(input => input.targetUserId ?? null)}::uuid[],
          ${inputs.map(input => input.reportId ?? null)}::uuid[],
          ${inputs.map(input => input.reviewDisputeId ?? null)}::uuid[],
          ${inputs.map(input => input.moderationAppealId ?? null)}::uuid[],
          ${inputs.map(input => input.communityApplicationId ?? null)}::uuid[],
          ${inputs.map(input => input.reason ?? null)}::text[],
          ${facts.map(fact => fact.role)}::text[],
          ${facts.map(fact => fact.previousRole)}::text[],
          ${facts.map(fact => fact.expiresAt)}::text[],
          ${facts.map(fact => fact.expiresAtPresent)}::boolean[],
          ${facts.map(fact => fact.reason)}::text[],
          ${facts.map(fact => fact.imageId)}::uuid[],
          ${facts.map(fact => fact.sourceKey)}::text[],
          ${facts.map(fact => fact.moderationTraining)}::boolean[]
        ) WITH ORDINALITY AS input(
          action_type, community_id, post_id, target_user_id, report_id,
          review_dispute_id, moderation_appeal_id, community_application_id, reason,
          metadata_role, metadata_previous_role, metadata_expires_at, metadata_expires_at_present,
          metadata_reason, metadata_image_id, metadata_source_key, metadata_moderation_training,
          ordinality
        )
      ),
      inserted AS (
        INSERT INTO moderator_actions (
          id, actor_id, action_type, community_id, post_id, target_user_id,
          report_id, review_dispute_id, moderation_appeal_id, community_application_id, reason,
          metadata_role, metadata_previous_role, metadata_expires_at, metadata_expires_at_present,
          metadata_reason, metadata_image_id, metadata_source_key, metadata_moderation_training
        )
        SELECT
          raw.id,
          ${actorId}::uuid,
          raw.action_type,
          raw.community_id,
          raw.post_id,
          raw.target_user_id,
          raw.report_id,
          raw.review_dispute_id,
          raw.moderation_appeal_id,
          raw.community_application_id,
          raw.reason,
          raw.metadata_role::community_member_roles,
          raw.metadata_previous_role::community_member_roles,
          raw.metadata_expires_at,
          raw.metadata_expires_at_present,
          raw.metadata_reason,
          raw.metadata_image_id,
          raw.metadata_source_key,
          raw.metadata_moderation_training
        FROM raw
        RETURNING id
      ),
      slugs AS (
        INSERT INTO moderator_action_topic_slugs (action_id, position, topic_slug)
        SELECT raw.id, slug.position, slug.topic_slug
        FROM raw
        JOIN UNNEST(
          ${slugs.ordinals}::bigint[],
          ${slugs.positions}::integer[],
          ${slugs.values}::text[]
        ) AS slug(ordinality, position, topic_slug) ON slug.ordinality = raw.ordinality
        RETURNING action_id
      ),
      restrictions AS (
        INSERT INTO moderator_action_restrictions (
          action_id, position, restriction_id, restriction_type
        )
        SELECT
          raw.id,
          item.position,
          item.restriction_id,
          item.restriction_type::community_restriction_types
        FROM raw
        JOIN UNNEST(
          ${restrictions.ordinals}::bigint[],
          ${restrictions.positions}::integer[],
          ${restrictions.ids}::uuid[],
          ${restrictions.types}::text[]
        ) AS item(ordinality, position, restriction_id, restriction_type)
          ON item.ordinality = raw.ordinality
        RETURNING action_id
      )
      SELECT inserted.id
      FROM inserted
      LEFT JOIN LATERAL (SELECT count(*) AS n FROM slugs) slug_count ON true
      LEFT JOIN LATERAL (SELECT count(*) AS n FROM restrictions) restriction_count ON true
    `,
    options,
  )
}
