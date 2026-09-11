export type ActivityPubInboxDeliveryLifecycle = 'available' | 'processing' | 'deferred' | 'failed'

export type ActivityPubInboxDeliveryCheckpoint = 'unverified' | 'verified' | 'sender-allowed'

export type ActivityPubInboxDeliveryTransitionName =
  | 'accept'
  | 'acknowledge-enqueue'
  | 'claim'
  | 'verify'
  | 'admit-sender'
  | 'defer'
  | 'release'
  | 'exhaust'
  | 'reject'
  | 'complete'
  | 'recover'
  | 'rearm'
  | 'expire'

type TransitionSentinel = 'absent' | 'deleted'
type TransitionState = ActivityPubInboxDeliveryLifecycle | TransitionSentinel

export type ActivityPubInboxDeliveryFenceMode = 'mint' | 'current' | 'rotate' | 'invalidate'
export type ActivityPubInboxDeliveryConsistency = 'primary'
export type ActivityPubInboxDeliveryAtomicBoundary =
  | 'single-row-mutation'
  | 'bounded-locking-claim'
  | 'bounded-locking-delete'
  | 'dedup-core-effect-envelope'
export type ActivityPubInboxDeliveryPostCommitEffect =
  | 'initial-awaited-enqueue'
  | 'delayed-awaited-enqueue'
  | 'recovery-bulk-awaited-enqueue'
  | 'sequential-backfill-enqueue'
  | 'follow-accept'
  | 'none'

type TransitionDefinition = {
  from: readonly TransitionState[]
  to: TransitionState | readonly TransitionState[]
  checkpoint:
    | ActivityPubInboxDeliveryCheckpoint
    | `${ActivityPubInboxDeliveryCheckpoint}->${ActivityPubInboxDeliveryCheckpoint}`
    | 'preserved'
  fence: ActivityPubInboxDeliveryFenceMode
  consistency: ActivityPubInboxDeliveryConsistency
  atomicBoundary: ActivityPubInboxDeliveryAtomicBoundary
  postCommitEffects: readonly ActivityPubInboxDeliveryPostCommitEffect[]
}

export type ActivityPubInboxDeliveryTransitionDimensions = Pick<
  TransitionDefinition,
  'fence' | 'consistency' | 'atomicBoundary' | 'postCommitEffects'
>

export const ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT = {
  accept: {
    from: ['absent'],
    to: 'available',
    checkpoint: 'unverified',
    fence: 'mint',
    consistency: 'primary',
    atomicBoundary: 'single-row-mutation',
    postCommitEffects: ['initial-awaited-enqueue'],
  },
  'acknowledge-enqueue': {
    from: ['available', 'processing'],
    to: ['available', 'processing'],
    checkpoint: 'preserved',
    fence: 'current',
    consistency: 'primary',
    atomicBoundary: 'single-row-mutation',
    postCommitEffects: ['none'],
  },
  claim: {
    from: ['available', 'deferred'],
    to: 'processing',
    checkpoint: 'preserved',
    fence: 'current',
    consistency: 'primary',
    atomicBoundary: 'single-row-mutation',
    postCommitEffects: ['none'],
  },
  verify: {
    from: ['processing'],
    to: 'processing',
    checkpoint: 'unverified->verified',
    fence: 'current',
    consistency: 'primary',
    atomicBoundary: 'single-row-mutation',
    postCommitEffects: ['none'],
  },
  'admit-sender': {
    from: ['processing'],
    to: 'processing',
    checkpoint: 'verified->sender-allowed',
    fence: 'current',
    consistency: 'primary',
    atomicBoundary: 'single-row-mutation',
    postCommitEffects: ['none'],
  },
  defer: {
    from: ['processing'],
    to: 'deferred',
    checkpoint: 'verified',
    fence: 'rotate',
    consistency: 'primary',
    atomicBoundary: 'single-row-mutation',
    postCommitEffects: ['delayed-awaited-enqueue'],
  },
  release: {
    from: ['processing'],
    to: 'available',
    checkpoint: 'preserved',
    fence: 'current',
    consistency: 'primary',
    atomicBoundary: 'single-row-mutation',
    postCommitEffects: ['none'],
  },
  exhaust: {
    from: ['processing'],
    to: 'failed',
    checkpoint: 'preserved',
    fence: 'current',
    consistency: 'primary',
    atomicBoundary: 'single-row-mutation',
    postCommitEffects: ['none'],
  },
  reject: {
    from: ['processing'],
    to: 'deleted',
    checkpoint: 'preserved',
    fence: 'current',
    consistency: 'primary',
    atomicBoundary: 'single-row-mutation',
    postCommitEffects: ['none'],
  },
  complete: {
    from: ['processing'],
    to: 'deleted',
    checkpoint: 'sender-allowed',
    fence: 'current',
    consistency: 'primary',
    atomicBoundary: 'dedup-core-effect-envelope',
    postCommitEffects: ['follow-accept'],
  },
  recover: {
    from: ['available', 'processing', 'deferred'],
    to: 'available',
    checkpoint: 'preserved',
    fence: 'rotate',
    consistency: 'primary',
    atomicBoundary: 'bounded-locking-claim',
    postCommitEffects: ['recovery-bulk-awaited-enqueue'],
  },
  rearm: {
    from: ['failed'],
    to: 'available',
    checkpoint: 'preserved',
    fence: 'rotate',
    consistency: 'primary',
    atomicBoundary: 'bounded-locking-claim',
    postCommitEffects: ['sequential-backfill-enqueue'],
  },
  expire: {
    from: ['available', 'processing', 'deferred', 'failed'],
    to: 'deleted',
    checkpoint: 'preserved',
    fence: 'invalidate',
    consistency: 'primary',
    atomicBoundary: 'bounded-locking-delete',
    postCommitEffects: ['none'],
  },
} as const satisfies Record<ActivityPubInboxDeliveryTransitionName, TransitionDefinition>

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
