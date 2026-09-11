import type { PrivateUser } from '@services/users/types'
import type { CreateTopicUpdates, Topic } from './types.mts'
import { beginTransaction, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { getTopicByAny } from './get.mts'
import assert from 'http-assert'
import { currentUserCanUpdateTopic } from './authorization.mts'
import { invalidate } from '@services/entity-cache'
import { enqueueOnTopicUpdated } from '@queues/entity-listeners/enqueues'
import { resolveHostname, setTopicHostnameLink } from './hostname-link.mts'
import sql from 'sql-template-strings'
import { createTopicRevision } from '@services/topic-revisions'
import { buildTopicRevisionChanges } from './update-revision-changes.mts'
import {
  appendTopicUpdateFields,
  assertValidTopicFieldUpdates,
  hasTopicFieldUpdates,
} from './update-fields.mts'
import { createTopicAliases, finalizeClaimedTopicAliases } from './aliases.mts'
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
  async function updateInStore(options: QueryOptions) {
    const hasUpdates = hasTopicFieldUpdates(changes)
    if (hasUpdates) {
      await assertValidTopicFieldUpdates(topic, changes, allowTypeChange, options)
      const updateQuery = sql`/* updateTopicInStore */ UPDATE topics SET updated_by_id = ${updater.id}`
      appendTopicUpdateFields(updateQuery, changes)
      let resolvedHostnameId: string | null | undefined
      if (changes.hostname !== undefined) {
        resolvedHostnameId = await resolveHostname(updater.id, changes.hostname, options)
        await setTopicHostnameLink(topic.id, resolvedHostnameId, options)
      }

      updateQuery.append(sql` WHERE id = ${topic.id}`)
      await write(updateQuery, options)

      if (changes.slug !== undefined) {
        claimedAliases = await createTopicAliases(topic.id, [topic.slug, changes.slug], {
          ...options,
          skipSideEffects: true,
        })
      }

      const revisionChanges = buildTopicRevisionChanges(topic, changes, resolvedHostnameId)
      if (Object.keys(revisionChanges).length > 0) {
        await createTopicRevision(topic.id, 'update', revisionChanges, updater.id, options)
      }
    }

    return getTopicByAny(topic.id, options)
  }
  const transactionOptions = queryOptions.query
    ? { query: queryOptions.query }
    : queryOptions.client
      ? queryOptions
      : null
  let topic2
  if (transactionOptions) {
    topic2 = await updateInStore(transactionOptions)
  } else {
    await using query = await beginTransaction()
    topic2 = await updateInStore({ query })
    await query.commit()
  }
  if (skipSideEffects) {
    return topic2
  }

  if (changes.slug !== undefined) {
    await finalizeClaimedTopicAliases(topic.id, claimedAliases)
  }
  await invalidate.topics(topic.id, topic.slug, changes.slug)
  if (topic.hostname_id || topic2?.hostname_id) {
    await invalidate.url_hostnames(topic.hostname_id, topic2?.hostname_id)
  }
  void enqueueOnTopicUpdated(topic.id, updater.id)
  return topic2
}
