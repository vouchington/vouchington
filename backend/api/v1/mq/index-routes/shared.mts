import allQueues from '../../../queues.mts'
import '../scheduled-jobs.mts'

export const QUEUE_NAMES = [...new Set(allQueues.map(queue => queue.name))]

export function findQueueByName(name: string) {
  return allQueues.find(queue => queue.name === name)
}
