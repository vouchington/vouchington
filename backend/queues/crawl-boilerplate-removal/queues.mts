import { createQueue } from '@data-stores/valkey-glide-mq'
import { BOILERPLATE_REMOVAL_QUEUE_NAME } from './config.mts'

export const boilerplateRemovalQueue = createQueue(BOILERPLATE_REMOVAL_QUEUE_NAME)
