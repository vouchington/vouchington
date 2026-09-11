import { initializeWorkerRuntime, reportWorkerLoadFailure } from './runtime.mts'
// Side-effect registration: see backend/entrypoints/api/index.mts for why this import exists.
import '@backend/service-registrations'

export { reportWorkerLoadFailure }

const runtime = await initializeWorkerRuntime()

export const startWorkerRuntime = runtime.startWorkerRuntime

if (!process.env.NODE_PREWARM) startWorkerRuntime()

export const sqsConsumers = runtime.sqsConsumers
export default runtime.workers
