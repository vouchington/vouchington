export type {
  ActivityPubInboxDelivery,
  ActivityPubInboxEnvelope,
} from './durable-delivery-data-contract.mts'

export type {
  ActivityPubInboxCapacityExceeded,
  RecoverableActivityPubInboxDelivery,
} from './durable-delivery-capacity-contract.mts'

export type ActivityPubInboxTransitionResult<T = undefined> =
  | { outcome: 'applied'; value: T }
  | { outcome: 'stale' }

/** The queue owns retries and delay; PostgreSQL retains the envelope and its checkpoints. */
export const ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT = {
  accept: { from: ['absent'], to: 'pending', atomicBoundary: 'single-row-mutation' },
  load: { from: ['pending'], to: 'pending', atomicBoundary: 'read-only' },
  verify: { from: ['pending'], to: 'pending', checkpoint: 'unverified->verified' },
  admitSender: { from: ['pending'], to: 'pending', checkpoint: 'verified->sender-allowed' },
  exhaust: { from: ['pending'], to: 'failed', atomicBoundary: 'single-row-mutation' },
  reject: { from: ['pending'], to: 'deleted', atomicBoundary: 'single-row-mutation' },
  complete: { from: ['pending'], to: 'deleted', atomicBoundary: 'dedup-core-effect-envelope' },
  recover: { from: ['pending'], to: 'pending', atomicBoundary: 'bounded-read' },
  reserveRecoveryRequeues: {
    from: ['pending'],
    to: 'pending',
    atomicBoundary: 'bounded-update',
  },
  exhaustRecoveryRequeues: { from: ['pending'], to: 'failed', atomicBoundary: 'bounded-update' },
  rearm: { from: ['failed'], to: 'pending', atomicBoundary: 'bounded-locking-update' },
  expire: { from: ['pending', 'failed'], to: 'deleted', atomicBoundary: 'bounded-locking-delete' },
} as const
