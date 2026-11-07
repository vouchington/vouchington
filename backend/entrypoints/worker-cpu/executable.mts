// Entry of the compiled worker-cpu executable. The first argument after any `-` flags must name an
// entrypoint (`serve.mts` is the image's default command); anything else fails instead of serving.
import { selectExecutableEntrypoint } from '@modules/utils/executable-entrypoint'

/* v8 ignore start -- process entrypoint exercised by the compiled image smoke tests. */
const ENTRYPOINTS: Record<string, () => Promise<unknown>> = {
  'image-smoke.mts': async () => {
    const { checkImageRuntime } = await import('@modules/utils/image-smoke')
    checkImageRuntime()
  },
  'check-native-addons.mts': () => import('./check-native-addons.mts'),
  'enqueue-heartbeat.mts': () => import('@backend/worker-runtime/enqueue-heartbeat'),
  'cli-smoke.mts': async () => {
    const { runWorkerIoCliSmoke } = await import('@modules/child-process/image-smoke')
    await runWorkerIoCliSmoke()
  },
  'serve.mts': () => import('./serve.mts'),
}

const { entrypoint, argv } = selectExecutableEntrypoint(process.argv, Object.keys(ENTRYPOINTS))
process.argv = argv
await ENTRYPOINTS[entrypoint]!()
/* v8 ignore stop */
