import type { DataRequestStatus } from '@voucha/types/entities/account-data-request'
import { createChannelPubSub } from './channel-pubsub.mts'

export type DataRequestStreamStatus = { status: DataRequestStatus; download_url?: string | null }

export const dataRequestPubSub = createChannelPubSub<DataRequestStreamStatus>('data-request:status')
