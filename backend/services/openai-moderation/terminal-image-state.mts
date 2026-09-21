import { imageStatePubSub } from '@data-stores/valkey-pubsub'
import onError from '@modules/on-error'

const terminalStatePublishAttempts = 3
const terminalStatePublishRetryMs = 100

export async function publishTerminalImageState(imageId: string, flagged: boolean): Promise<void> {
  let lastError: unknown
  for (let attempt = 1; attempt <= terminalStatePublishAttempts; attempt++) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- the next terminal-state publish runs only after this attempt fails
      await imageStatePubSub.publish(imageId, {
        id: imageId,
        upload_status: 'complete',
        upload_error: null,
        ready: !flagged,
        blocked: flagged,
      })
      return
    } catch (error) {
      lastError = error
      if (attempt < terminalStatePublishAttempts) {
        // oxlint-disable-next-line no-await-in-loop -- retry backoff must finish before the next publish attempt starts
        await sleep(terminalStatePublishRetryMs)
      }
    }
  }
  onError(lastError instanceof Error ? lastError : new Error(String(lastError)))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
