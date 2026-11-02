import { initializeWorkerRuntime } from './runtime.mts'
// Side-effect registration: see backend/entrypoints/api/index.mts for why this import exists.
import '@backend/service-registrations'

const runtime = await initializeWorkerRuntime()

// Starting the runtime is the process entrypoint's job (serve.mts), so importing this module
// only builds the worker collections.
export const startWorkerRuntime = runtime.startWorkerRuntime
export const sqsConsumers = runtime.sqsConsumers
export default runtime.workers
