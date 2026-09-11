import { createChannelPubSub } from './channel-pubsub.mts'

export type DataRequestStatus = { status: string; download_url?: string | null }

export const dataRequestPubSub = createChannelPubSub<DataRequestStatus>('data-request:status')
