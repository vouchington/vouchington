import { BACKGROUND_CPU_HANDLERS } from './processors/handlers.mts'
import { createBackgroundCpuWorker } from './workers/create-worker.mts'

export const backgroundCpu = createBackgroundCpuWorker({ handlers: BACKGROUND_CPU_HANDLERS })
