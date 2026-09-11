import { createQueue } from '@data-stores/valkey-glide-mq'
import { MODERATION_OMNI_SINGLE_QUEUE_NAME } from './config.mts'

export const openai_moderation_omni_single = createQueue(MODERATION_OMNI_SINGLE_QUEUE_NAME)
