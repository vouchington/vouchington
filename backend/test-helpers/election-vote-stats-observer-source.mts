import { TestQueue } from 'glide-mq/testing'
import type { Queue } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '../data-stores/valkey-glide-mq/index.mts'
import { createTestQueueTerminalSource } from './election-terminal-source.mts'
import {
  observeElectionQueueTerminals,
  observeElectionTerminalSource,
} from './election-vote-stats-events.mts'

/** The actual canonical alias binding selects transport; no flags or local Worker fallback. */
export function observeOwnedElectionQueue(queue: Queue) {
  if (queue instanceof TestQueue) {
    return observeElectionTerminalSource(createTestQueueTerminalSource(queue, workerQueuePrefix))
  }
  return observeElectionQueueTerminals(queue.name, {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
  })
}
