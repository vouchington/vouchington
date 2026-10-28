// Entry of the compiled worker-cpu executable. It runs the worker by default and the one-off
// commands that the backend image smoke tests name as the container command.
const ENTRYPOINTS: Record<string, () => Promise<unknown>> = {
  'check-native-addons.mts': () => import('./check-native-addons.mts'),
  'enqueue-heartbeat.mts': () => import('@backend/worker-runtime/enqueue-heartbeat'),
  'serve.mts': () => import('./serve.mts'),
}

const entrypoint = process.argv.slice(2).find(arg => Object.hasOwn(ENTRYPOINTS, arg)) ?? 'serve.mts'

/* c8 ignore next -- process entrypoint exercised by the compiled image smoke tests. */
await ENTRYPOINTS[entrypoint]!()
