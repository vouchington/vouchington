import type { ImageUploadState } from '@voucha/types/entities/image'
import { createChannelPubSub } from './channel-pubsub.mts'

export const imageStatePubSub = createChannelPubSub<ImageUploadState>('image:state')
