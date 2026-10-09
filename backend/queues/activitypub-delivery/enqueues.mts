import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import { v5 as uuidv5 } from 'uuid'
import { ACTIVITYPUB_DELIVERY_DEFAULTS, PRIORITY_DEFAULT, QUEUE_NAME } from './config.mts'
import { activitypubDelivery } from './queues.mts'

type DistributeFollowActivityData = {
  activityId: string
  activityType: 'Follow'
  sourceUserId: string
  targetUserId: string
}

type DistributeUndoFollowActivityData = {
  activityId: string
  activityType: 'UndoFollow'
  originalActivityId: string
  sourceUserId: string
  targetUserId: string
}

type DistributeLikeActivityData = {
  activityId: string
  activityType: 'Like'
  sourceUserId: string
  targetPostId: string
}

type DistributeUndoLikeActivityData = {
  activityId: string
  activityType: 'UndoLike'
  originalActivityId: string
  sourceUserId: string
  targetPostId: string
}

export type DistributeActivityData =
  | DistributeFollowActivityData
  | DistributeUndoFollowActivityData
  | DistributeLikeActivityData
  | DistributeUndoLikeActivityData

// Accept never goes through distributeActivity's fan-out: an inbound Follow's Accept always
// targets exactly one already-known inbox (the sender's), never "all of some local user's
// followers", so it is not shaped like DistributeActivityData and is not part of that union.
type DeliverAcceptActivityData = {
  activityId: string
  activityType: 'Accept'
  sourceUserId: string
  inboxUrl: string
  followActivityId: string
  followActorUri: string
}

export type DeliverActivityData =
  | (DistributeActivityData & { inboxUrl: string })
  | DeliverAcceptActivityData

export type DistributeActivityInput = DistributeActivityData

function getDistributeActivityOptions(data: DistributeActivityData) {
  return {
    priority: PRIORITY_DEFAULT,
    ordering: {
      key: `activitypub-distribute__${data.activityId}`,
      concurrency: 1,
    },
  }
}

const enqueueDistributeActivityJob = createEnqueueFunction<
  DistributeActivityData,
  'distributeActivity'
>({
  defaults: ACTIVITYPUB_DELIVERY_DEFAULTS,
  queue: activitypubDelivery,
  queueName: QUEUE_NAME,
  jobName: 'distributeActivity',
})

const enqueueDeliverActivityJob = createEnqueueFunction<DeliverActivityData, 'deliverActivity'>({
  defaults: ACTIVITYPUB_DELIVERY_DEFAULTS,
  queue: activitypubDelivery,
  queueName: QUEUE_NAME,
  jobName: 'deliverActivity',
})

// Bulk fan-out for a batch of social actions (e.g. every relation in one upsertEntityRelation
// call): one addBulk round-trip per batch, not one enqueue per input.
export const enqueueBulkDistributeActivity = createBulkEnqueueFunction<
  DistributeActivityInput,
  DistributeActivityData,
  'distributeActivity'
>({
  defaults: ACTIVITYPUB_DELIVERY_DEFAULTS,
  queue: activitypubDelivery,
  queueName: QUEUE_NAME,
  jobName: 'distributeActivity',
  buildJob: input => ({
    data: input,
    opts: getDistributeActivityOptions(input),
  }),
})

// One job per follower inbox. Callers should dedupe inboxUrl within a batch before calling this —
// see @workers/activitypub-delivery's distributeActivity processor — since the `simple`
// deduplication key here is a defense-in-depth backstop, not the primary collapse mechanism.
export const enqueueBulkDeliverActivity = createBulkEnqueueFunction<
  DeliverActivityData,
  DeliverActivityData,
  'deliverActivity'
>({
  defaults: ACTIVITYPUB_DELIVERY_DEFAULTS,
  queue: activitypubDelivery,
  queueName: QUEUE_NAME,
  jobName: 'deliverActivity',
  buildJob: data => ({
    data,
    opts: {
      priority: PRIORITY_DEFAULT,
      deduplication: {
        id: `deliver_${data.activityId}__${data.inboxUrl}`,
        mode: 'simple',
      },
    },
  }),
})

// Fans a single social action (Follow / Like / Undo-Like) out to the acting user's remote
// followers (Phase C4). The caller supplies the activity identity from durable PostgreSQL state,
// so every fan-out job and retry shares the same AS2 activity id.
export function enqueueDistributeActivity(input: DistributeActivityInput): EnqueueReturnType {
  return enqueueDistributeActivityJob(input, getDistributeActivityOptions(input))
}

export type DeliverAcceptActivityInput = Pick<
  DeliverAcceptActivityData,
  'sourceUserId' | 'inboxUrl' | 'followActivityId' | 'followActorUri'
>

// Namespace for deriving Accept activity ids. Accept ids are already on the wire once sent, so
// this value is part of the federation contract and must never change.
const ACCEPT_ACTIVITY_ID_NAMESPACE = 'c3a4ee5c-0137-4c31-a396-53fe5b957c5b'

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
    {
      priority: PRIORITY_DEFAULT,
      deduplication: { id: `deliver_accept__${input.followActivityId}`, mode: 'simple' },
    },
  )
}
