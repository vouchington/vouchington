import { dataRequestPubSub } from '@data-stores/valkey-pubsub'
import onError from '@modules/on-error'

export async function publishTerminalStatus(
  requestId: string,
  status: 'ready' | 'failed',
): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- the next publish attempt runs only after the prior attempt fails
      await dataRequestPubSub.publish(requestId, { status })
      return
    } catch (err) {
      lastError = err
    }
  }
  onError(lastError instanceof Error ? lastError : new Error(String(lastError)))
}
