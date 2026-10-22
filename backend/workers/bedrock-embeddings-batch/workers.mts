import { createBedrockEmbeddingsCreationWorker } from './processors/creation-worker.mts'

export const bedrockEmbeddingsCreationWorker = await createBedrockEmbeddingsCreationWorker()
