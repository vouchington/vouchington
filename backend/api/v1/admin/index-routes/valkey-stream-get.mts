import { createChannelPubSub } from '@data-stores/valkey-pubsub'
import onError from '@modules/on-error'
import { getCacheGroups } from '@services/valkey-admin/clear-cache'
import { currentUserCanAccessValkeyAdmin } from '@services/valkey-admin/authorization'
import app from '../../../app.mts'
import { createAdminSnapshotStream } from './snapshot-stream.mts'

const TICKER_INTERVAL_MS = 10_000

const valkeyPubSub = createChannelPubSub<unknown>('admin:valkey')

async function fetchSnapshot() {
  const cacheGroupsResult = await Promise.allSettled([Promise.resolve(getCacheGroups())]).then(
    ([result]) => result,
  )
  const errors: { groups?: string } = {}
  if (cacheGroupsResult.status === 'rejected') {
    errors.groups =
      cacheGroupsResult.reason instanceof Error
        ? cacheGroupsResult.reason.message
        : 'Failed to load cache groups'
  }
  return {
    groups: cacheGroupsResult.status === 'fulfilled' ? cacheGroupsResult.value : null,
    ...(Object.keys(errors).length > 0 ? { errors } : {}),
  }
}

function publishValkeySnapshot(publish: (value: unknown) => Promise<void>): void {
  fetchSnapshot()
    .then(snapshot => publish(snapshot))
    .catch(onError)
}

app.route('/api/v1/admin/valkey/stream').get(
  createAdminSnapshotStream({
    authorize: currentUserCanAccessValkeyAdmin,
    rateLimitKey: 'GET:/api/v1/admin/valkey/stream',
    pubSub: valkeyPubSub,
    tickerIntervalMs: TICKER_INTERVAL_MS,
    publishTick: publishValkeySnapshot,
    loadInitialValue: fetchSnapshot,
  }),
)
