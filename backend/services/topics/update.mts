import type { PrivateUser } from '@services/users/types'
import type { CreateTopicUpdates, Topic } from './types.mts'
import { beginTransaction, write, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { getTopicByAny } from './get.mts'
import assert from 'http-assert'
import { currentUserCanUpdateTopic } from './authorization.mts'
import { invalidate } from '@services/entity-cache'
import { enqueueOnTopicUpdated } from '@queues/entity-listeners/enqueues'
import { setTopicHostnameLink } from './hostname-link.mts'
import { resolveHostname } from './resolve-hostname.mts'
import { lockTopicHostnameMutations } from '@services/urls-hostnames/ownership-lock'
import { lockTopicHostnameOwnership } from './hostname-ownership-lock.mts'
import sql from 'sql-template-strings'
import { createTopicRevision } from '@services/topic-revisions'
import { buildTopicRevisionChanges } from './update-revision-changes.mts'
import {
  appendTopicUpdateFields,
  assertValidTopicFieldUpdates,
  hasTopicFieldUpdates,
} from './update-fields.mts'
import { createTopicAliases, finalizeClaimedTopicAliases } from './aliases.mts'
import { lockExistingTopicAliasPublicationScopes } from './alias-publication-locks.mts'
import { prepareTopicAliasInput } from './alias-preflight.mts'
import { enqueueReconcileMediaDeliveryRegistry } from '@queues/notifications/enqueues'
import {
  prepublishImageSurfaceDenials,
  syncImageSurfacePlacement,
  assertImageDeliveryTransaction,
  type ImageSurfaceReference,
} from '@services/media-delivery-safety'
export const updateTopic = async (
  updater: PrivateUser,
  topic: Topic,
  changes: Partial<CreateTopicUpdates>,
  {
    skipSideEffects = false,
    allowTypeChange = false,
    ...queryOptions
  }: { skipSideEffects?: boolean; allowTypeChange?: boolean } & QueryOptions = {},
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
        // ast-grep-ignore: no-three-sequential-awaits -- topic ownership stabilizes discovery; resolving the new id must finish before locking the old and new hostname ids.
        await lockTopicHostnameMutations(query, [topic.id])
        resolvedHostnameId = await resolveHostname(
          updater.id,
          changes.hostname,
          options,
          'private_email',
        )
        await lockTopicHostnameOwnership(
          query,
          [topic.id],
          resolvedHostnameId ? [resolvedHostnameId] : [],
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
      const references: (ImageSurfaceReference & { nextImageId?: string | null })[] = []
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
      if (references.length) {
        const imageQuery = options.query ?? write
        assertImageDeliveryTransaction(imageQuery)
        // Match topic merges: take the image owner domain before the topic row.
        await prepublishImageSurfaceDenials(references, imageQuery)
        const { rows: activeTopics } = await imageQuery<{ id: string }>(sql`
          /* updateTopic:lockActiveImageOwner */
          SELECT id FROM topics
          WHERE id = ${topic.id} AND deleted_at IS NULL AND merged_into_topic_id IS NULL
          FOR UPDATE
        `)
        assert(activeTopics.length === 1, 409, 'Topic was merged or deleted')
        for (const reference of references) {
          // oxlint-disable-next-line no-await-in-loop -- one predeclared admission batch, then each exact owner binding.
          await syncImageSurfacePlacement(
            reference,
            reference.nextImageId ?? null,
            reference.nextImageId ? updater.id : null,
            imageQuery,
            { prepublished: true },
          )
        }
      }

      const updateQuery = sql`/* updateTopicInStore */ UPDATE topics SET updated_by_id = ${updater.id}`
      appendTopicUpdateFields(updateQuery, changes)
      if (changes.hostname !== undefined) {
        await setTopicHostnameLink(topic.id, resolvedHostnameId ?? null, options)
      }

      updateQuery.append(sql` WHERE id = ${topic.id}`)
      await write(updateQuery, options)

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

  if (changes.slug !== undefined) {
    await finalizeClaimedTopicAliases(topic.id, claimedAliases)
  } else {
    await invalidate.topics(topic.id, topic.slug)
  }
  if (topic.hostname_id || topic2?.hostname_id) {
    await invalidate.url_hostnames(topic.hostname_id, topic2?.hostname_id)
  }
  void enqueueOnTopicUpdated(topic.id, updater.id)
  return topic2
}
