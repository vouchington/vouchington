// One-off worker image command that enqueues a heartbeat for a running worker to process. The
// backend image smoke tests run it from a second container of the image under test.
import { shutdownDataStoresForOneOffCommand } from '@data-stores/graceful-shutdown'
import { enqueueHeartbeat } from '@queues/heartbeat/enqueues'

/* c8 ignore start -- process entrypoint exercised through the backend image smoke tests. */
try {
  await enqueueHeartbeat()
} finally {
  await shutdownDataStoresForOneOffCommand()
}
/* c8 ignore stop */
