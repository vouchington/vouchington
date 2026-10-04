import { createQueue } from '@data-stores/valkey-glide-mq'
import { QUEUE_NAME, CREATION_QUEUE_NAME } from './config.mts'

export const bedrock_embeddings_batch = createQueue(QUEUE_NAME)

export const bedrock_embeddings_batch_creation = createQueue(CREATION_QUEUE_NAME)
