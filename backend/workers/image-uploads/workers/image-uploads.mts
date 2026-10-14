import { createImageUploadsWorker as createWorker } from '../processors/create-image-uploads-worker.mts'

export const imageUploads = createWorker()
