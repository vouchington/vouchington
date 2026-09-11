import { syncArticles } from '@services/articles'
import { getPrivateUserByAny } from '@services/users/get'
import { UnrecoverableError } from '@modules/queue-errors'
import { articleSyncPubSub, type ArticleSyncStatus } from '@data-stores/valkey-pubsub'
import onError from '@modules/on-error'

const TERMINAL_STATUS_PUBLISH_ATTEMPTS = 3
const TERMINAL_STATUS_PUBLISH_RETRY_MS = 100

type ArticleSyncProcessorDependencies = {
  getPrivateUserByAny: typeof getPrivateUserByAny
  publishTerminalStatus: typeof publishTerminalStatus
  syncArticles: typeof syncArticles
}

type PublishTerminalStatusDependencies = {
  onError: typeof onError
  publish: typeof articleSyncPubSub.publish
  sleep: typeof sleep
}

export async function publishTerminalStatus(
  jobId: string,
  status: ArticleSyncStatus,
  dependencies?: Partial<PublishTerminalStatusDependencies>,
): Promise<void> {
  const publish =
    dependencies?.publish ??
    ((publishJobId, publishStatus) => articleSyncPubSub.publish(publishJobId, publishStatus))
  const reportError = dependencies?.onError ?? onError
  const wait = dependencies?.sleep ?? sleep
  let lastError: unknown
  for (let attempt = 1; attempt <= TERMINAL_STATUS_PUBLISH_ATTEMPTS; attempt++) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- the next terminal-status publish runs only after this attempt fails
      await publish(jobId, status)
      return
    } catch (err) {
      lastError = err
      if (attempt < TERMINAL_STATUS_PUBLISH_ATTEMPTS) {
        // oxlint-disable-next-line no-await-in-loop -- retry backoff must finish before the next publish attempt starts
        await wait(TERMINAL_STATUS_PUBLISH_RETRY_MS)
      }
    }
  }
  reportError(lastError instanceof Error ? lastError : new Error(String(lastError)))
}

export async function processArticleSync(
  userId: string,
  jobId?: string,
  dependencies?: Partial<ArticleSyncProcessorDependencies>,
) {
  const getUser = dependencies?.getPrivateUserByAny ?? getPrivateUserByAny
  const publishStatus = dependencies?.publishTerminalStatus ?? publishTerminalStatus
  const syncUserArticles = dependencies?.syncArticles ?? syncArticles
  try {
    const user = await getUser(userId)
    if (!user) throw new UnrecoverableError(`User ${userId} not found`)
    const result = await syncUserArticles(user)
    if (jobId) await publishStatus(jobId, { status: 'completed', result })
    return result
  } catch (err) {
    if (jobId) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      await publishStatus(jobId, { status: 'failed', error: errorMsg })
    }
    throw err
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
