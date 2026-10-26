import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import type {
  DeliverActivityData,
  DistributeActivityData,
} from '@queues/background/enqueues/activitypub-domain'
import {
  ACTIVITYPUB_DELIVER_ACTIVITY_JOB,
  ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB,
} from '@queues/background/enqueues/activitypub-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import { v5 as uuidv5 } from 'uuid'

export type { DeliverActivityData, DistributeActivityData }

export type DistributeActivityInput = DistributeActivityData

// GlideMQ reserves ':' in job IDs. The identity is activity plus the page's starting cursor.
export function distributionPageJobId(data: Pick<DistributeActivityData, 'activityId' | 'cursor'>) {
  return `activitypub-distribute__${data.activityId}__${data.cursor ?? 'start'}`
}

const enqueueDeliverActivityJob = createBackgroundEnqueue(ACTIVITYPUB_DELIVER_ACTIVITY_JOB)

// Bulk fan-out for a batch of social actions (e.g. every relation in one upsertEntityRelation
// call): one addBulk round-trip per batch, not one enqueue per input.
export const enqueueBulkDistributeActivity = createBackgroundBulkEnqueue(
  ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB,
  (input: DistributeActivityInput) => ({
    data: input,
    opts: { jobId: distributionPageJobId(input) },
  }),
)

// One job per follower inbox. Callers should dedupe inboxUrl within a batch before calling this —
// see @workers/activitypub's distributeActivity processor — since the `simple`
// deduplication key here is a defense-in-depth backstop, not the primary collapse mechanism.
export const enqueueBulkDeliverActivity = createBackgroundBulkEnqueue(
  ACTIVITYPUB_DELIVER_ACTIVITY_JOB,
  (data: DeliverActivityData) => ({
    data,
    opts: {
      deduplication: {
        id: `deliver_${data.activityId}__${data.inboxUrl}`,
        mode: 'simple',
      },
    },
  }),
)

// Fans a single social action (Follow / Like / Undo-Like) out to the acting user's remote
// followers (Phase C4). The caller supplies the activity identity from durable PostgreSQL state,
// so every fan-out job and retry shares the same AS2 activity id.
const enqueueDistributeActivityJob = createBackgroundEnqueue(ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB)

export function enqueueDistributeActivity(data: DistributeActivityInput): EnqueueReturnType {
  return enqueueDistributeActivityJob(data, {
    jobId: distributionPageJobId(data),
  })
}

export type DeliverAcceptActivityInput = Pick<
  Extract<DeliverActivityData, { activityType: 'Accept' }>,
  'sourceUserId' | 'inboxUrl' | 'followActivityId' | 'followActorUri'
>

// Namespace for deriving Accept activity ids. Accept ids are already on the wire once sent, so
// this value is part of the federation contract and must never change.
const ACCEPT_ACTIVITY_ID_NAMESPACE = 'c3a4ee5c-0137-4c31-a396-53fe5b957c5b'
const UNDO_FOLLOW_ACTIVITY_ID_NAMESPACE = 'ca584341-8398-4ba6-99dc-fd3dc3394c2b'

// One Undo identity per Follow generation. A deleted relation retains the original Follow id,
// so both direct admission and recovery reconstruct the same protocol activity after a crash.
export function getUndoFollowActivityId(originalFollowActivityId: string): string {
  return uuidv5(originalFollowActivityId, UNDO_FOLLOW_ACTIVITY_ID_NAMESPACE)
}

/**
 * The Accept's own activity id, derived from the local user it comes from and the inbound Follow it
 * acknowledges. A redelivered Follow is acknowledged again, and the remote must see the same Accept
 * id every time so it can treat the repeat as the one it already processed. No row stores this id:
 * the Follow id is the remote's, unique per follow request, and a re-follow after an Undo arrives
 * under a new Follow id and so gets a new Accept id.
 */
export function getAcceptActivityId(
  input: Pick<DeliverAcceptActivityInput, 'sourceUserId' | 'followActivityId'>,
): string {
  return uuidv5(`${input.sourceUserId}\n${input.followActivityId}`, ACCEPT_ACTIVITY_ID_NAMESPACE)
}

// Acknowledges one specific inbound Follow (Phase C-followup to C2/C3's inbound receiver). Unlike
// Follow/Like/Undo, the recipient inbox is already known from the inbound Follow itself, so this
// enqueues straight onto the deliverActivity job — the same job distributeActivity's fan-out
// ultimately produces one of per follower inbox — skipping the distributeActivity fan-out step
// entirely. Deduplicated per original Follow id so a redelivered/duplicate inbound Follow (see
// dispatchInboundActivity's dedup ledger) cannot double-enqueue an Accept while one is in flight.
// Once that job finishes, a duplicate Follow sends the Accept again on purpose (the sender may have
// missed it), and the stable activity id makes the repeat idempotent for the remote.
export function enqueueDeliverAcceptActivity(input: DeliverAcceptActivityInput): EnqueueReturnType {
  return enqueueDeliverActivityJob(
    { ...input, activityId: getAcceptActivityId(input), activityType: 'Accept' },
    { deduplication: { id: `deliver_accept__${input.followActivityId}`, mode: 'simple' } },
  )
}
