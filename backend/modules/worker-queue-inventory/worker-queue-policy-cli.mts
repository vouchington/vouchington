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
if (import.meta.main) {
  try {
    process.stdout.write(`${workerQueuePolicyCommandOutput(process.argv[2])}\n`)
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  }
}
/* v8 ignore stop */
