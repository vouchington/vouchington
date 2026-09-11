import { createChannelPubSub } from './channel-pubsub.mts'

export type ImportProgressChunk = {
  batchId: string
  completed: number
  failed: number
  total: number
  done: boolean
}

export type ImportProgressSubscription = {
  setHandler(handler: ((chunk: ImportProgressChunk) => void) | null): void
  close(): Promise<void>
}

const importProgressPubSub = createChannelPubSub<ImportProgressChunk>('import:progress', {
  closeSubscriberWhenIdle: true,
})

export function publishImportProgress(
  batchId: string,
  progress: ImportProgressChunk,
): Promise<void> {
  return importProgressPubSub.publish(batchId, progress)
}

export async function subscribeImportProgress(
  batchId: string,
): Promise<ImportProgressSubscription> {
  const subscription = await importProgressPubSub.subscribe(batchId)

  return {
    setHandler(handler): void {
      subscription.setHandler(handler)
    },
    close(): Promise<void> {
      return Promise.resolve(subscription.close())
    },
  }
}
