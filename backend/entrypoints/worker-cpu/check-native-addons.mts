// One-off worker-cpu image command that runs the native code a worker only loads on first use.
// The other addons load when the worker imports them, so a worker that boots has loaded them;
// vurst-ai opens ONNX Runtime (ORT_DYLIB_PATH) at its first inference.
import { shutdownDataStoresForOneOffCommand } from '@data-stores/graceful-shutdown'
import { detectAiGeneratedModeration } from '@workers/ai-agents/processors/ai-generated-content'

/* c8 ignore start -- process entrypoint exercised through the backend image smoke tests. */
try {
  const result = await detectAiGeneratedModeration(
    'A short paragraph about a weekend hike along the river with friends.',
    { confidenceThreshold: 0.5 },
  )
  console.log(`✓ vurst-ai inference ran (${result.detector} ${result.detector_model_version})`)
} finally {
  await shutdownDataStoresForOneOffCommand()
}
/* c8 ignore stop */
