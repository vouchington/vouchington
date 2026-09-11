import { enqueueHeartbeat } from '../backend/queues/heartbeat/enqueues.mts'
import baseGlobalSetup from './global-setup.mts'
import { PLAYWRIGHT_WEB_SERVER_LOG_DIR } from './config/shared-config.mts'
import { startWorkerCpu } from './config/worker-cpu-process.mts'

export default async function credentialedGlobalSetup(
  config: Parameters<typeof baseGlobalSetup>[0],
) {
  await baseGlobalSetup(config)

  const worker = await startWorkerCpu(PLAYWRIGHT_WEB_SERVER_LOG_DIR)

  try {
    await worker.waitForLog('Workers: workers loaded.', 60_000)

    // Enqueue a heartbeat and wait for it to complete — this proves the worker
    // is actually consuming queue jobs before the AI-agent chat specs run.
    await enqueueHeartbeat()
    await worker.waitForLog('job completed: heartbeat', 30_000)
  } catch (error) {
    try {
      await worker.stop()
    } catch {
      // ignore stop errors; preserve original error
    }
    throw error
  }

  return async () => {
    await worker.stop()
  }
}
