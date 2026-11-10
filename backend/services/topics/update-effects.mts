import type { Topic, CreateTopicUpdates } from './types.mts'
import type { getTopicByAny } from './get.mts'
import { createTopicAliases, finalizeClaimedTopicAliases } from './aliases.mts'
import { invalidate } from '@services/entity-cache'
import { enqueueOnTopicUpdated } from '@queues/entity-listeners/enqueues'
import { awaitReportedEnqueueAdmission } from '@queues/background/enqueues'

export async function settleTopicUpdateEffects(
  topic: Topic,
  topic2: Awaited<ReturnType<typeof getTopicByAny>>,
  changes: Partial<CreateTopicUpdates>,
  claimedAliases: Awaited<ReturnType<typeof createTopicAliases>>,
  updaterId: string,
): Promise<void> {
  if (changes.slug !== undefined) {
    await finalizeClaimedTopicAliases(topic.id, claimedAliases)
  } else {
    await invalidate.topics(topic.id, topic.slug)
  }
  if (topic.hostname_id || topic2?.hostname_id) {
    await invalidate.url_hostnames(topic.hostname_id, topic2?.hostname_id)
  }
  await awaitReportedEnqueueAdmission(() => enqueueOnTopicUpdated(topic.id, updaterId))
}
