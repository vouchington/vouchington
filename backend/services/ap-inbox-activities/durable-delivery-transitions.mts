import {
  acceptActivityPubInboxDelivery,
  loadActivityPubInboxDelivery,
} from './durable-delivery-transition-intake.mts'
import {
  admitActivityPubInboxDeliverySender,
  verifyActivityPubInboxDelivery,
} from './durable-delivery-transition-checkpoints.mts'
import {
  completeActivityPubInboxDelivery,
  exhaustActivityPubInboxDelivery,
  rejectActivityPubInboxDelivery,
} from './durable-delivery-transition-finalization.mts'
import {
  rearmFailedActivityPubInboxDeliveries,
  recoverActivityPubInboxDeliveries,
  reserveActivityPubInboxRecoveryRequeues,
  exhaustActivityPubInboxRecoveryRequeues,
  releaseUnadmittedActivityPubInboxRecoveryRequeues,
} from './durable-delivery-transition-recovery.mts'
import { ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT as contract } from './durable-delivery-transition-contract.mts'
import { expireActivityPubInboxDeliveries } from './durable-delivery-expiry.mts'

export * from './durable-delivery-transition-contract.mts'

export const activityPubInboxDeliveryTransitions = {
  accept: Object.assign(acceptActivityPubInboxDelivery, { contract: contract.accept }),
  load: Object.assign(loadActivityPubInboxDelivery, { contract: contract.load }),
  verify: Object.assign(verifyActivityPubInboxDelivery, { contract: contract.verify }),
  admitSender: Object.assign(admitActivityPubInboxDeliverySender, {
    contract: contract.admitSender,
  }),
  exhaust: Object.assign(exhaustActivityPubInboxDelivery, { contract: contract.exhaust }),
  reject: Object.assign(rejectActivityPubInboxDelivery, { contract: contract.reject }),
  complete: Object.assign(completeActivityPubInboxDelivery, { contract: contract.complete }),
  recover: Object.assign(recoverActivityPubInboxDeliveries, { contract: contract.recover }),
  reserveRecoveryRequeues: Object.assign(reserveActivityPubInboxRecoveryRequeues, {
    contract: contract.reserveRecoveryRequeues,
  }),
  exhaustRecoveryRequeues: Object.assign(exhaustActivityPubInboxRecoveryRequeues, {
    contract: contract.exhaustRecoveryRequeues,
  }),
  releaseUnadmittedRecoveryRequeues: releaseUnadmittedActivityPubInboxRecoveryRequeues,
  rearm: Object.assign(rearmFailedActivityPubInboxDeliveries, { contract: contract.rearm }),
  expire: Object.assign(expireActivityPubInboxDeliveries, { contract: contract.expire }),
} as const
