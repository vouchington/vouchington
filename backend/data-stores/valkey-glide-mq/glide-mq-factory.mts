import '@data-stores/valkey-core/shutdown'

import {
  FlowProducer,
  Queue,
  Worker,
  type Processor,
  type QueueOptions,
  type WorkerOptions,
} from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { workerQueueCommandClient } from './glide-mq-shared-client.mts'
import {
  registerGlideMQInstance,
  unregisterGlideMQInstance,
} from '@data-stores/valkey-core/glide-mq-registry'

type SharedQueueOptions = Pick<QueueOptions, 'deadLetterQueue' | 'compression' | 'serializer'>
type SharedWorkerOptions = Omit<WorkerOptions, 'connection' | 'prefix'>

export function createQueue<T = unknown>(name: string, options: SharedQueueOptions = {}): Queue<T> {
  const queue = new Queue<T>(name, {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    client: workerQueueCommandClient,
    ...options,
  })
  registerGlideMQInstance(queue)
  return queue
}
export function createWorker<D = unknown, R = unknown>(
  name: string,
  processor: Processor<D, R>,
  options: SharedWorkerOptions = {},
): Worker<D, R> {
  const worker = new Worker<D, R>(name, processor, {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    commandClient: workerQueueCommandClient,
    ...options,
  })
  registerGlideMQInstance(worker)
  return worker
}
export function createFlowProducer(): FlowProducer {
  const fp = new FlowProducer({
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    client: workerQueueCommandClient,
  })
  registerGlideMQInstance(fp)
  return fp
}

export async function closeAndUnregisterGlideMQInstance(instance: {
  close(): Promise<void>
}): Promise<void> {
  await instance.close()
  unregisterGlideMQInstance(instance)
}
