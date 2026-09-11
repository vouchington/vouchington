import { dataRequestPubSub } from '@data-stores/valkey-pubsub'
import onError from '@modules/on-error'

type PublishTerminalStatusDependencies = {
  onError: typeof onError
  publish: typeof dataRequestPubSub.publish
}

export async function publishTerminalStatus(
  requestId: string,
  status: 'ready' | 'failed',
  dependencies?: Partial<PublishTerminalStatusDependencies>,
): Promise<void> {
  const publish =
    dependencies?.publish ??
    ((publishRequestId, publishStatus) =>
      dataRequestPubSub.publish(publishRequestId, publishStatus))
  const reportError = dependencies?.onError ?? onError
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- the next publish attempt runs only after the prior attempt fails
      await publish(requestId, { status })
      return
    } catch (error) {
      lastError = error
    }
  }
  reportError(lastError instanceof Error ? lastError : new Error(String(lastError)))
}
