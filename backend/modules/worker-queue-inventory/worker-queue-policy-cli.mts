import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { allWorkerQueueNames, formatQueueIncludeList } from './worker-queue-policy.mts'

export function workerQueuePolicyCommandOutput(command: string | undefined): string {
  switch (command) {
    case 'dev-all-queues':
      return formatQueueIncludeList(allWorkerQueueNames())
    default:
      throw new Error(`Unknown worker queue policy command: ${command ?? ''}`)
  }
}

/* v8 ignore start -- process I/O wrapper; command dispatch is covered above. */
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    process.stdout.write(`${workerQueuePolicyCommandOutput(process.argv[2])}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
/* v8 ignore stop */
