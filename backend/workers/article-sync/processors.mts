import { syncArticles } from '@services/articles'
import { getPrivateUserByAny } from '@services/users/get'
import { UnrecoverableError } from '@vouchington/queue-errors'
import { articleSyncPubSub, type ArticleSyncStatus } from '@data-stores/valkey-pubsub'
import onError from '@modules/on-error'

const TERMINAL_STATUS_PUBLISH_ATTEMPTS = 3
const TERMINAL_STATUS_PUBLISH_RETRY_MS = 100

async function publishTerminalStatus(jobId: string, status: ArticleSyncStatus): Promise<void> {
  let lastError: unknown
  for (let attempt = 1; attempt <= TERMINAL_STATUS_PUBLISH_ATTEMPTS; attempt++) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- the next terminal-status publish runs only after this attempt fails
      await articleSyncPubSub.publish(jobId, status)
      return
    } catch (err) {
      lastError = err
      if (attempt < TERMINAL_STATUS_PUBLISH_ATTEMPTS) {
        // oxlint-disable-next-line no-await-in-loop -- retry backoff must finish before the next publish attempt starts
        await sleep(TERMINAL_STATUS_PUBLISH_RETRY_MS)
      }
    }
  }
  onError(lastError instanceof Error ? lastError : new Error(String(lastError)))
}

export async function processArticleSync(userId: string, jobId?: string) {
  try {
    const user = await getPrivateUserByAny(userId)
    if (!user) throw new UnrecoverableError(`User ${userId} not found`)
    const result = await syncArticles(user)
    if (jobId) await publishTerminalStatus(jobId, { status: 'completed', result })
    return result
  } catch (err) {
    if (jobId) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      await publishTerminalStatus(jobId, { status: 'failed', error: errorMsg })
    }
    throw err
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
