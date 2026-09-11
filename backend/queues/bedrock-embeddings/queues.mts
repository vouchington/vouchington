import { createQueue } from '@data-stores/valkey-glide-mq'
import { EMBEDDINGS_NOVA_MULTIMODAL_V1_SINGLE_QUEUE_NAME } from './config.mts'

export const bedrock_embeddings_nova_multimodal_v1_single = createQueue(
  EMBEDDINGS_NOVA_MULTIMODAL_V1_SINGLE_QUEUE_NAME,
)
