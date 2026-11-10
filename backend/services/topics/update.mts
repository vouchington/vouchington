import { topicImageMutationChanges, type TopicImageMutationRow } from './update-image-changes.mts'
import { settleTopicUpdateEffects } from './update-effects.mts'
import type { PrivateUser } from '@services/users/types'
import type { CreateTopicUpdates, Topic } from './types.mts'
import { beginTransaction, write, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { getTopicByAny } from './get.mts'
import assert from 'http-assert'
import { currentUserCanUpdateTopic } from './authorization.mts'
import { setTopicHostnameLink } from './hostname-link.mts'
import { prepareHostnameForOwnedMutation } from './resolve-hostname.mts'
import sql from 'sql-template-strings'
import { createTopicRevision } from '@services/topic-revisions'
import { buildTopicRevisionChanges } from './update-revision-changes.mts'
import {
  appendTopicUpdateFields,
  assertValidTopicFieldUpdates,
  hasTopicFieldUpdates,
} from './update-fields.mts'
import { createTopicAliases } from './aliases.mts'
import { lockExistingTopicAliasPublicationScopes } from './alias-publication-locks.mts'
import { prepareTopicAliasInput } from './alias-preflight.mts'
import { enqueueReconcileMediaDeliveryRegistry } from '@queues/notifications/enqueues'
import {
  writeImageSurfaceMutation,
  assertImageDeliveryTransaction,
  type ImageSurfaceReference,
} from '@services/media-delivery-safety'
import { imageSurfaceMutationPreimage } from '@services/media-delivery-safety/surface-mutation-bindings'

type UpdateTopicOptions = QueryOptions & { allowTypeChange?: boolean } & (
    | { skipSideEffects: true }
    | { skipSideEffects?: false; query?: never; client?: never }
  )

export const updateTopic = async (
  updater: PrivateUser,
  topic: Topic,
  changes: Partial<CreateTopicUpdates>,
  { skipSideEffects = false, allowTypeChange = false, ...queryOptions }: UpdateTopicOptions = {},
) => {
  assert(currentUserCanUpdateTopic(updater), 403, 'Forbidden')
  let claimedAliases: Awaited<ReturnType<typeof createTopicAliases>> = []
  async function updateInStore(options: QueryOptions & { query: TransactionQuery }) {
    const hasUpdates = hasTopicFieldUpdates(changes)
    if (hasUpdates) {
      await assertValidTopicFieldUpdates(topic, changes, allowTypeChange, options)
      let resolvedHostnameId: string | null | undefined
      if (changes.hostname !== undefined) {
        const query = options.query!
        resolvedHostnameId = await prepareHostnameForOwnedMutation(
          updater.id,
          changes.hostname,
          query,
        )
      }
      const preparedPublicationScopes =
        changes.slug === undefined
          ? undefined
          : {
              query: options.query,
              aliasIds: await lockExistingTopicAliasPublicationScopes(
                options.query,
                prepareTopicAliasInput([topic.slug, changes.slug]),
              ),
            }
      const references: (ImageSurfaceReference & { nextImageId: string | null })[] = []
      if (changes.logo_image_id !== undefined)
        references.push({
          surfaceKind: 'topic-logo-image',
          topicId: topic.id,
          nextImageId: changes.logo_image_id ?? null,
        })
      if (changes.hero_image_id !== undefined)
        references.push({
          surfaceKind: 'topic-hero-image',
          topicId: topic.id,
          nextImageId: changes.hero_image_id ?? null,
        })

      const updateQuery = sql`/* updateTopicInStore */ UPDATE topics SET updated_by_id = ${updater.id}`
      appendTopicUpdateFields(updateQuery, changes)
      if (changes.hostname !== undefined) {
        await setTopicHostnameLink(topic.id, resolvedHostnameId ?? null, options)
      }

      if (references.length) {
        const imageQuery = options.query ?? write
        assertImageDeliveryTransaction(imageQuery)
        await writeImageSurfaceMutation(
          imageQuery,
          references,
          updater.id,
          async (surfaceReferences, scopeQuery) => {
            const attemptUpdateQuery = sql``.append(updateQuery)
            const statement = imageSurfaceMutationPreimage(surfaceReferences, 'updateTopicInStore')
            attemptUpdateQuery.append(sql` FROM (SELECT DISTINCT topic_id FROM surface_preimage) owner_preimage
              WHERE topics.id = ${topic.id} AND owner_preimage.topic_id = topics.id
                AND topics.deleted_at IS NULL AND topics.merged_into_topic_id IS NULL`)
            if (references.some(reference => reference.surfaceKind === 'topic-logo-image'))
              attemptUpdateQuery.append(sql` AND topics.logo_image_id IS NOT DISTINCT FROM
                (SELECT current_image_id FROM surface_preimage WHERE surface_kind = 'topic-logo-image')`)
            if (references.some(reference => reference.surfaceKind === 'topic-hero-image'))
              attemptUpdateQuery.append(sql` AND topics.hero_image_id IS NOT DISTINCT FROM
                (SELECT current_image_id FROM surface_preimage WHERE surface_kind = 'topic-hero-image')`)
            attemptUpdateQuery.append(sql` RETURNING WITH (OLD AS prior, NEW AS current)
              prior.logo_image_id AS previous_logo_image_id,
              current.logo_image_id AS current_logo_image_id,
              prior.hero_image_id AS previous_hero_image_id,
              current.hero_image_id AS current_hero_image_id,
              (SELECT placement_id FROM surface_preimage WHERE surface_kind = 'topic-logo-image') AS previous_logo_placement_id,
              (SELECT placement_revision FROM surface_preimage WHERE surface_kind = 'topic-logo-image') AS previous_logo_placement_revision,
              (SELECT activation_revision FROM surface_preimage WHERE surface_kind = 'topic-logo-image') AS previous_logo_activation_revision,
              (SELECT placement_id FROM surface_preimage WHERE surface_kind = 'topic-hero-image') AS previous_hero_placement_id,
              (SELECT placement_revision FROM surface_preimage WHERE surface_kind = 'topic-hero-image') AS previous_hero_placement_revision,
              (SELECT activation_revision FROM surface_preimage WHERE surface_kind = 'topic-hero-image') AS previous_hero_activation_revision`)
            statement
              .append(sql`, updated AS (`)
              .append(attemptUpdateQuery)
              .append(sql`) SELECT * FROM updated`)
            const { rows } = await scopeQuery<TopicImageMutationRow>(statement)
            assert(rows.length === 1, 409, 'Topic or image surface changed')
            return {
              result: undefined,
              changes: topicImageMutationChanges(references, rows[0]!),
            }
          },
        )
      } else {
        updateQuery.append(
          sql` WHERE id = ${topic.id} AND deleted_at IS NULL AND merged_into_topic_id IS NULL`,
        )
        await write(updateQuery, options)
      }

      if (changes.slug !== undefined) {
        claimedAliases = await createTopicAliases(topic.id, [topic.slug, changes.slug], {
          ...options,
          skipSideEffects: true,
          preparedPublicationScopes,
        })
      }

      const revisionChanges = buildTopicRevisionChanges(topic, changes, resolvedHostnameId)
      if (Object.keys(revisionChanges).length > 0) {
        await createTopicRevision(topic.id, 'update', revisionChanges, updater.id, options)
      }
    }

    return getTopicByAny(topic.id, options)
  }
  let topic2
  if (queryOptions.query || queryOptions.client) {
    topic2 = await withTransactionOptions(queryOptions, query => updateInStore({ query }))
  } else {
    await using query = await beginTransaction()
    topic2 = await updateInStore({ query })
    await query.commit()
    if ('logo_image_id' in changes || 'hero_image_id' in changes) {
      void enqueueReconcileMediaDeliveryRegistry()
    }
  }
  if (skipSideEffects) {
    return topic2
  }

  await settleTopicUpdateEffects(topic, topic2, changes, claimedAliases, updater.id)
  return topic2
}
