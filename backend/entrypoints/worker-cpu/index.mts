import { initializeWorkerRuntime } from './runtime.mts'
// Side-effect registration: see backend/entrypoints/api/index.mts for why this import exists.
import '@backend/service-registrations'

const runtime = await initializeWorkerRuntime()

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/backend/entrypoints/worker-cpu/README.md`.
 */
export const startWorkerRuntime = runtime.startWorkerRuntime

if (!process.env.NODE_PREWARM) await startWorkerRuntime()

export const sqsConsumers = runtime.sqsConsumers
export default runtime.workers
