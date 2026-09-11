import {
  acknowledgeActivityPubInboxDeliveryEnqueue,
  acceptActivityPubInboxDelivery,
  claimActivityPubInboxDelivery,
} from './durable-delivery-transition-intake.mts'
import {
  admitActivityPubInboxDeliverySender,
  deferActivityPubInboxDelivery,
  verifyActivityPubInboxDelivery,
} from './durable-delivery-transition-checkpoints.mts'
import {
  completeActivityPubInboxDelivery,
  exhaustActivityPubInboxDelivery,
  rejectActivityPubInboxDelivery,
  releaseActivityPubInboxDelivery,
} from './durable-delivery-transition-finalization.mts'
import {
  rearmFailedActivityPubInboxDeliveries,
  recoverActivityPubInboxDeliveries,
} from './durable-delivery-transition-recovery.mts'
import { ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT } from './durable-delivery-transition-contract.mts'
import { expireActivityPubInboxDeliveries } from './durable-delivery-expiry.mts'

export * from './durable-delivery-transition-contract.mts'

type ActivityPubInboxDeliveryTransitionFacade = {
  accept: typeof acceptActivityPubInboxDelivery & {
    contract: typeof ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.accept
  }
  acknowledgeEnqueue: typeof acknowledgeActivityPubInboxDeliveryEnqueue & {
    contract: (typeof ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT)['acknowledge-enqueue']
  }
  claim: typeof claimActivityPubInboxDelivery & {
    contract: typeof ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.claim
  }
  verify: typeof verifyActivityPubInboxDelivery & {
    contract: typeof ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.verify
  }
  admitSender: typeof admitActivityPubInboxDeliverySender & {
    contract: (typeof ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT)['admit-sender']
  }
  defer: typeof deferActivityPubInboxDelivery & {
    contract: typeof ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.defer
  }
  release: typeof releaseActivityPubInboxDelivery & {
    contract: typeof ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.release
  }
  exhaust: typeof exhaustActivityPubInboxDelivery & {
    contract: typeof ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.exhaust
  }
  reject: typeof rejectActivityPubInboxDelivery & {
    contract: typeof ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.reject
  }
  complete: typeof completeActivityPubInboxDelivery & {
    contract: typeof ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.complete
  }
  recover: typeof recoverActivityPubInboxDeliveries & {
    contract: typeof ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.recover
  }
  rearm: typeof rearmFailedActivityPubInboxDeliveries & {
    contract: typeof ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.rearm
  }
  expire: typeof expireActivityPubInboxDeliveries & {
    contract: typeof ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.expire
  }
}

export const activityPubInboxDeliveryTransitions = {
  accept: Object.assign(acceptActivityPubInboxDelivery, {
    contract: ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.accept,
  }),
  acknowledgeEnqueue: Object.assign(acknowledgeActivityPubInboxDeliveryEnqueue, {
    contract: ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT['acknowledge-enqueue'],
  }),
  claim: Object.assign(claimActivityPubInboxDelivery, {
    contract: ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.claim,
  }),
  verify: Object.assign(verifyActivityPubInboxDelivery, {
    contract: ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.verify,
  }),
  admitSender: Object.assign(admitActivityPubInboxDeliverySender, {
    contract: ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT['admit-sender'],
  }),
  defer: Object.assign(deferActivityPubInboxDelivery, {
    contract: ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.defer,
  }),
  release: Object.assign(releaseActivityPubInboxDelivery, {
    contract: ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.release,
  }),
  exhaust: Object.assign(exhaustActivityPubInboxDelivery, {
    contract: ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.exhaust,
  }),
  reject: Object.assign(rejectActivityPubInboxDelivery, {
    contract: ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.reject,
  }),
  complete: Object.assign(completeActivityPubInboxDelivery, {
    contract: ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.complete,
  }),
  recover: Object.assign(recoverActivityPubInboxDeliveries, {
    contract: ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.recover,
  }),
  rearm: Object.assign(rearmFailedActivityPubInboxDeliveries, {
    contract: ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.rearm,
  }),
  expire: Object.assign(expireActivityPubInboxDeliveries, {
    contract: ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.expire,
  }),
} as const satisfies ActivityPubInboxDeliveryTransitionFacade
