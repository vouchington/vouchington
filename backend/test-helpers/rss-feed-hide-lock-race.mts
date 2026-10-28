import {
  beginTransaction,
  writePool,
  type OwnedTransaction,
  type PoolClient,
  type TransactionQuery,
} from '@data-stores/psql'
import { lockHostnameOwnership } from '../services/urls-hostnames/ownership-lock.mts'
import { getFirstTestHostnameOwnershipLockKey } from './hostname-ownership.mts'
import { observeTestAdvisoryLockNotice } from './postgres-advisory-lock-notice.mts'
import { discardTestPostgresClient } from './postgres-client-loan.mts'
import {
  assertTestOwnedPostgresWait,
  getTestOwnedPostgresLock,
} from './postgres-client-lock-identity.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

type Notice = ReturnType<typeof observeTestAdvisoryLockNotice>

/** Witness the topic, publication, then hostname lock chain on explicitly retained clients. */
export async function runTestRssFeedHideLockRace(input: {
  owner: OwnedTransaction
  publication: OwnedTransaction
  topicId: string
  feedId: string
  hostnameId: string
  hide: (query: TransactionQuery) => Promise<void>
}): Promise<void> {
  let observer: PoolClient | undefined
  let hiderClient: PoolClient | undefined
  let probeClient: PoolClient | undefined
  let hider: OwnedTransaction | undefined
  let probe: OwnedTransaction | undefined
  let topicNotice: Notice | undefined
  let feedNotice: Notice | undefined
  let probeNotice: Notice | undefined
  let hiding: Promise<void> | undefined
  let probing: Promise<void> | undefined
  let failure: unknown
  const cleanupFailures: unknown[] = []
  let hiderRestoreFailed = false
  let probeRestoreFailed = false
  const attempt = async (work: () => PromiseLike<unknown>) => {
    try {
      await work()
    } catch (err) {
      cleanupFailures.push(err)
    }
  }
  try {
    const [ownerPid, publicationPid] = await Promise.all([
      getTestPostgresBackendProcessId(input.owner),
      getTestPostgresBackendProcessId(input.publication),
    ])
    const borrowed = await Promise.allSettled([writePool.connect(), writePool.connect()])
    if (borrowed[0].status === 'fulfilled') observer = borrowed[0].value
    if (borrowed[1].status === 'fulfilled') hiderClient = borrowed[1].value
    if (borrowed[0].status === 'rejected') throw borrowed[0].reason
    if (borrowed[1].status === 'rejected') throw borrowed[1].reason
    const observingClient = borrowed[0].value
    const hiderConnection = borrowed[1].value
    hider = await beginTransaction({ client: hiderConnection })
    const [hiderPid, topicLock, feedLock] = await Promise.all([
      getTestPostgresBackendProcessId(hider),
      getTestOwnedPostgresLock(observingClient, {
        holderProcessId: ownerPid,
        lock: { kind: 'advisory', key: `topic-hostname:${input.topicId.toLowerCase()}` },
      }),
      getTestOwnedPostgresLock(observingClient, {
        holderProcessId: publicationPid,
        lock: { kind: 'advisory', key: `rss_feed:${input.feedId.toLowerCase()}` },
      }),
    ])
    if (topicLock.kind !== 'advisory' || feedLock.kind !== 'advisory')
      throw new Error('Expected the two exact advisory holder locks')
    topicNotice = observeTestAdvisoryLockNotice(hiderConnection, topicLock.tag)
    await topicNotice.ready
    feedNotice = observeTestAdvisoryLockNotice(hiderConnection, feedLock.tag)
    await feedNotice.ready
    hiding = input.hide(hider)
    void hiding.catch(() => {})
    const hidingOutcome = Promise.allSettled([hiding])
    await topicNotice.wait(hidingOutcome)
    await assertTestOwnedPostgresWait(
      observingClient,
      hiderPid,
      ownerPid,
      'lockTopicHostnameMutations',
    )
    await input.owner.commit()

    await feedNotice.wait(hidingOutcome)
    await assertTestOwnedPostgresWait(
      observingClient,
      hiderPid,
      publicationPid,
      'lockPostPublicationRssFeedScopes',
    )
    probeClient = await writePool.connect()
    probe = await beginTransaction({ client: probeClient })
    const probePid = await getTestPostgresBackendProcessId(probe)
    const hostnameKey = await getFirstTestHostnameOwnershipLockKey(
      probe,
      input.hostnameId,
      hiderPid,
    )
    const hostnameLock = await getTestOwnedPostgresLock(observingClient, {
      holderProcessId: hiderPid,
      lock: { kind: 'advisory', key: hostnameKey },
    })
    if (hostnameLock.kind !== 'advisory')
      throw new Error('Expected the exact hostname ownership lock')
    probeNotice = observeTestAdvisoryLockNotice(probeClient, hostnameLock.tag)
    await probeNotice.ready
    probing = lockHostnameOwnership(probe, [input.hostnameId])
    void probing.catch(() => {})
    await probeNotice.wait(Promise.allSettled([probing]))
    await assertTestOwnedPostgresWait(observingClient, probePid, hiderPid, 'lockHostnameOwnership')
    await input.publication.commit()
    await hiding
    await hider.commit()
    await probing
    await probe.commit()
  } catch (err) {
    failure = err
  } finally {
    // Free both barriers before draining actions; the probe still waits on hider's transaction.
    await Promise.all([
      attempt(() => input.owner[Symbol.asyncDispose]()),
      attempt(() => input.publication[Symbol.asyncDispose]()),
    ])
    if (hiding) {
      const pending = hiding
      await attempt(() => pending)
    }
    if (hider) {
      const transaction = hider
      await attempt(() => transaction[Symbol.asyncDispose]())
    }
    if (probing) {
      const pending = probing
      await attempt(() => pending)
    }
    if (probe) {
      const transaction = probe
      await attempt(() => transaction[Symbol.asyncDispose]())
    }
    if (probeNotice) {
      try {
        await probeNotice.close()
      } catch (err) {
        probeRestoreFailed = true
        cleanupFailures.push(err)
      }
    }
    if (feedNotice) {
      try {
        await feedNotice.close()
      } catch (err) {
        hiderRestoreFailed = true
        cleanupFailures.push(err)
      }
    }
    if (topicNotice) {
      try {
        await topicNotice.close()
      } catch (err) {
        hiderRestoreFailed = true
        cleanupFailures.push(err)
      }
    }
    if (probeClient) {
      const client = probeClient
      await attempt(() =>
        probeRestoreFailed ? discardTestPostgresClient(client) : Promise.resolve(client.release()),
      )
    }
    if (hiderClient) {
      const client = hiderClient
      await attempt(() =>
        hiderRestoreFailed ? discardTestPostgresClient(client) : Promise.resolve(client.release()),
      )
    }
    if (observer) {
      const client = observer
      await attempt(() => Promise.resolve(client.release()))
    }
  }
  const independent = cleanupFailures.filter(err => err !== failure)
  if (independent.length)
    throw new AggregateError(
      failure === undefined ? independent : [failure, ...independent],
      'RSS feed hide lock race and cleanup failed',
      { cause: failure ?? independent[0] },
    )
  if (failure !== undefined)
    throw failure instanceof Error
      ? failure
      : new Error('RSS feed hide lock race failed', { cause: failure })
}
