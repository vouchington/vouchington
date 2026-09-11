import { EventEmitter } from 'node:events'
import { DeleteMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs'
import { SQSClient } from '@modules/aws'
import { recordWorkerQueueTopologySkew } from '@modules/on-error'
import { isQueueSelected, parseQueueSelection } from '@vouchington/worker-runtime'

const MAX_NUMBER_OF_MESSAGES = 10
const WAIT_TIME_SECONDS = 20

export type SqsMessage = {
  readonly messageId: string
  readonly body: string
  readonly receiptHandle: string
}

export type SqsConsumerHandler = (message: SqsMessage) => Promise<void>

export type SqsConsumerPort = {
  receive: (signal: AbortSignal) => Promise<SqsMessage[]>
  delete: (receiptHandle: string) => Promise<void>
}

export interface SqsConsumer extends EventEmitter {
  readonly name: string
  close: () => Promise<void>
}

export type SqsConsumerDefinition = {
  queueName: string
  // Returns null when this consumer's own required configuration (e.g. a queue URL env var) is
  // absent, so loadSqsConsumers() can drop it and continue loading every other consumer instead
  // of failing its Promise.all — see loadSqsConsumers. The definition's load() is responsible for
  // reporting the skip (e.g. via recordSqsConsumerConfigMissing).
  load: () => Promise<SqsConsumer | null>
  requiresExplicitInclusion?: boolean
}

export function selectedSqsConsumerDefinitions(
  definitions: SqsConsumerDefinition[],
  queues = process.env.QUEUES,
  onUnknownIncludes: (unknownQueueNames: readonly string[]) => void = recordWorkerQueueTopologySkew,
  // Queue names selected via the same QUEUES env var but consumed by a sibling runtime in this
  // process (e.g. glide-mq workers in worker-runtime.mts), not by any SqsConsumerDefinition here.
  // Mirrors worker-runtime.mts's identically-named parameter for the same reason: a queueClass:
  // A worker runtime can put every policy-known queue name into one QUEUES include list.
  queueNamesOwnedByOtherRuntimes: readonly string[] = [],
): SqsConsumerDefinition[] {
  const knownQueueNames = [...definitions.map(d => d.queueName), ...queueNamesOwnedByOtherRuntimes]
  const selection = parseQueueSelection(queues, knownQueueNames, {
    dropUnknownIncludes: true,
    onUnknownIncludes,
  })
  return definitions.filter(definition => {
    if (definition.requiresExplicitInclusion && selection.mode !== 'include') return false
    return isQueueSelected(selection, definition.queueName)
  })
}

export function loadSqsConsumers(
  definitions: SqsConsumerDefinition[],
  queues = process.env.QUEUES,
  onUnknownIncludes: (unknownQueueNames: readonly string[]) => void = recordWorkerQueueTopologySkew,
  queueNamesOwnedByOtherRuntimes: readonly string[] = [],
): Promise<SqsConsumer[]> {
  return Promise.all(
    selectedSqsConsumerDefinitions(
      definitions,
      queues,
      onUnknownIncludes,
      queueNamesOwnedByOtherRuntimes,
    ).map(definition => definition.load()),
  ).then(consumers => consumers.filter(consumer => consumer != null))
}

export type CreateSqsConsumerOptions = {
  name: string
  queueUrl: string
  handleMessage: SqsConsumerHandler
  port?: SqsConsumerPort
}

class SqsConsumerImpl extends EventEmitter implements SqsConsumer {
  readonly name: string
  readonly #abortController = new AbortController()
  readonly #loop: Promise<void>
  #closed = false

  constructor(name: string, port: SqsConsumerPort, handleMessage: SqsConsumerHandler) {
    super()
    this.name = name
    this.#loop = this.#poll(port, handleMessage)
  }

  async close(): Promise<void> {
    if (this.#closed) return
    this.#closed = true
    this.emit('closing')
    // Abort the in-flight (or next) long poll so shutdown doesn't block up to WAIT_TIME_SECONDS on
    // an idle receive. Messages already pulled from a prior batch are left to finish handling
    // below, not cancelled — an unfinished handler simply leaves its message undeleted, and SQS's
    // visibility timeout redelivers it. That is the correctness guarantee, not a bug to work around.
    this.#abortController.abort()
    await this.#loop
    this.emit('closed')
  }

  async #poll(port: SqsConsumerPort, handleMessage: SqsConsumerHandler): Promise<void> {
    while (!this.#abortController.signal.aborted) {
      let messages: SqsMessage[]
      try {
        // oxlint-disable-next-line no-await-in-loop -- long-polling receive is inherently sequential; the next receive can't start until this one resolves or is aborted
        messages = await port.receive(this.#abortController.signal)
      } catch (error) {
        if (this.#abortController.signal.aborted) break
        this.emit('poll-error', error)
        // Prevent CPU starvation and log storms during persistent errors
        // oxlint-disable-next-line no-await-in-loop
        await new Promise(resolve => globalThis.setTimeout(resolve, 5000))
        continue
      }

      for (const message of messages) {
        // oxlint-disable-next-line no-await-in-loop -- messages from one receive batch are handled sequentially, bounded by MAX_NUMBER_OF_MESSAGES per batch
        await this.#handleMessage(message, port, handleMessage)
      }
    }
  }

  async #handleMessage(
    message: SqsMessage,
    port: SqsConsumerPort,
    handleMessage: SqsConsumerHandler,
  ): Promise<void> {
    this.emit('message-received', message)
    try {
      await handleMessage(message)
    } catch (error) {
      this.emit('message-failed', message, error)
      return
    }

    try {
      await port.delete(message.receiptHandle)
    } catch (error) {
      this.emit('message-delete-failed', message, error)
      return
    }
    this.emit('message-deleted', message)
  }
}

export function createSqsConsumer(options: CreateSqsConsumerOptions): SqsConsumer {
  const port = options.port ?? createSqsClientPort(options.queueUrl)
  return new SqsConsumerImpl(options.name, port, options.handleMessage)
}

function createSqsClientPort(queueUrl: string): SqsConsumerPort {
  return {
    receive: signal => receiveFromSqs(queueUrl, signal),
    async delete(receiptHandle: string) {
      await deleteFromSqs(queueUrl, receiptHandle)
    },
  }
}

/* no-mistakes: integration=aws */
async function receiveFromSqs(queueUrl: string, signal: AbortSignal): Promise<SqsMessage[]> {
  const result = await SQSClient.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: MAX_NUMBER_OF_MESSAGES,
      WaitTimeSeconds: WAIT_TIME_SECONDS,
    }),
    { abortSignal: signal },
  )

  return (result.Messages ?? []).flatMap(message => {
    if (!message.MessageId || !message.ReceiptHandle || message.Body == null) return []
    return [
      { messageId: message.MessageId, body: message.Body, receiptHandle: message.ReceiptHandle },
    ]
  })
}

/* no-mistakes: integration=aws */
async function deleteFromSqs(queueUrl: string, receiptHandle: string): Promise<void> {
  await SQSClient.send(
    new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle }),
  )
}
