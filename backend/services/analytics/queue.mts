// Canonical implementation lives in @data-stores/analytics/queue (avoids a
// data-stores/valkey <-> services/analytics workspace cycle: data-stores/valkey's
// queue factory needs these trackers but must not depend on @services/analytics).
export {
  trackJobEnqueue,
  trackQueueWorkerEvent,
  trackQueueWorkerJobProgressEvent,
  trackQueueWorkerJobCompletedEvent,
} from '@data-stores/analytics/queue'
