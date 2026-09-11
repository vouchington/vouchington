import type { BasicUser } from '@services/users/types'
import { resolveHostname } from '@services/topics/hostname-link'
import { upsertTopicElectionVotes } from '@services/elections-votes/topic/votes-upsert'
import { normalizeHostname } from '@ts-shared/utils/urls'
import assert from 'http-assert'
import onError from '@modules/on-error'
import { createInstanceWithRetry } from './create-instance-helpers.mts'
import { findExistingInstanceByHostnameId } from './find-existing-instance.mts'
import {
  classifyFediverseInstance,
  type InstanceClassificationMetadata,
  type InstanceClassificationResult,
} from '@services/fediverse-search/adapters/instance-classification'

export type ClassifyFediverseInstance = (hostname: string) => Promise<InstanceClassificationResult>

export type CreateInstanceResult = {
  status: 'created' | 'upvoted'
  topic_id: string
  topic_slug: string
}

/**
 * Suggests a fediverse instance by hostname, mirroring createSourceFromUrl's dedup->upvote
 * pattern: if an active fediverse_instance topic already exists for the hostname, upvote it
 * instead of erroring. A concurrent creation race degrades to upvote rather than a 409.
 *
 * Any authenticated user may call this (not just administrators) — createTopic() is
 * admin-only, so this bespoke flow mirrors RSS's create-source-helpers.mts instead.
 */
export async function createInstanceFromHostname(
  currentUser: BasicUser,
  hostname: string,
  classifyInstance: ClassifyFediverseInstance = classifyFediverseInstance,
): Promise<CreateInstanceResult> {
  const normalizedHostname = normalizeHostname(hostname)
  assert(normalizedHostname, 422, 'hostname must be a valid hostname')

  const hostnameId = await resolveHostname(currentUser.id, normalizedHostname)
  assert(hostnameId, 500, 'Failed to resolve hostname')

  const existing = await findExistingInstanceByHostnameId(hostnameId)
  if (existing) {
    await upsertTopicElectionVotes(currentUser.id, [{ entityId: existing.topic_id, score: 1 }])
    return { status: 'upvoted', topic_id: existing.topic_id, topic_slug: existing.topic_slug }
  }

  const metadata = await classifyNewInstanceHostname(normalizedHostname, classifyInstance)

  const created = await createInstanceWithRetry({
    currentUser,
    hostnameId,
    hostname: normalizedHostname,
    attempt: 0,
    metadata,
  })

  if (!created) {
    // Race condition: another request created this instance concurrently — switch to upvote.
    const raceExisting = await findExistingInstanceByHostnameId(hostnameId)
    assert(raceExisting, 500, 'Concurrent instance creation race condition')
    await upsertTopicElectionVotes(currentUser.id, [{ entityId: raceExisting.topic_id, score: 1 }])
    return {
      status: 'upvoted',
      topic_id: raceExisting.topic_id,
      topic_slug: raceExisting.topic_slug,
    }
  }

  upsertTopicElectionVotes(currentUser.id, [{ entityId: created.topicId, score: 1 }]).catch(onError)

  return { status: 'created', topic_id: created.topicId, topic_slug: created.slug }
}

/**
 * Best-effort: classification only succeeds for the handful of hosts this deployment's
 * NodeInfo adapters already talk to (see classifyFediverseInstance), so almost every
 * user-suggested hostname degrades to null here — the instance topic still gets created with
 * unclassified extension columns rather than failing.
 */
async function classifyNewInstanceHostname(
  hostname: string,
  classifyInstance: ClassifyFediverseInstance,
): Promise<InstanceClassificationMetadata | null> {
  try {
    const result = await classifyInstance(hostname)
    return result.status === 'ok' ? result.metadata : null
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
    return null
  }
}
