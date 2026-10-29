// Entry of the compiled worker-io executable. It runs the worker by default and the one-off
// command that the backend image smoke tests name as the container command.
import { selectExecutableEntrypoint } from '@modules/utils/executable-entrypoint'

/* v8 ignore start -- process entrypoint exercised by the compiled image smoke tests. */
const ENTRYPOINTS: Record<string, () => Promise<unknown>> = {
  'enqueue-heartbeat.mts': () => import('@backend/worker-runtime/enqueue-heartbeat'),
  'serve.mts': () => import('./serve.mts'),
}

const { entrypoint, argv } = selectExecutableEntrypoint(
  process.argv,
  Object.keys(ENTRYPOINTS),
  'serve.mts',
)
process.argv = argv
await ENTRYPOINTS[entrypoint]!()
/* v8 ignore stop */
