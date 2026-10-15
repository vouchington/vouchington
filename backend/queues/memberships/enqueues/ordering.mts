import { entityOrderingKey } from '@queues/background/enqueues/define-job'

/** One serial lane inside the memberships domain; the key is namespaced so no other domain shares it. */
export function membershipOrdering(key: string): { key: string; concurrency: 1 } {
  return { key: entityOrderingKey('memberships', key), concurrency: 1 }
}
