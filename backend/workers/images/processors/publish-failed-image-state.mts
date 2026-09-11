const ATTEMPTS = 3
const RETRY_MS = 100

type Publish = (
  imageId: string,
  state: {
    id: string
    upload_status: 'failed'
    upload_error: string
    ready: false
    blocked: false
  },
) => Promise<unknown>

export async function publishFailedImageState(
  imageId: string,
  errorMessage: string,
  publish: Publish,
  onError: (error: Error) => void,
): Promise<void> {
  let lastError: unknown
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- retries must be sequential
      await publish(imageId, {
        id: imageId,
        upload_status: 'failed',
        upload_error: errorMessage,
        ready: false,
        blocked: false,
      })
      return
    } catch (error) {
      lastError = error
      if (attempt < ATTEMPTS) {
        // oxlint-disable-next-line no-await-in-loop -- backoff before the next publish attempt
        await new Promise(resolve => setTimeout(resolve, RETRY_MS))
      }
    }
  }
  onError(lastError instanceof Error ? lastError : new Error(String(lastError)))
}
