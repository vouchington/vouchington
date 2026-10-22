import { createQueue } from '@data-stores/valkey-glide-mq'
import { BEDROCK_EMBEDDINGS_CREATION_QUEUE_NAME } from './config.mts'

export const bedrockEmbeddingsCreation = createQueue(BEDROCK_EMBEDDINGS_CREATION_QUEUE_NAME, {
  priorityKind: 'ranked',
})
