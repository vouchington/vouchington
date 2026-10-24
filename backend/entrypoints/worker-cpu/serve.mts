import http from 'node:http'
import { addGracefulShutdownCallback } from '@data-stores/graceful-shutdown'
import onError, { flushSentry } from '@modules/on-error'
import { validateRuntimeImageOrigin } from '@modules/utils/image-origin'
import { registerWorkerServe } from '@vouchington/worker-runtime'
import workers, { sqsConsumers } from './index.mts'

validateRuntimeImageOrigin()

registerWorkerServe({
  workers: [...workers, ...sqsConsumers],
  addShutdown: addGracefulShutdownCallback,
  onError,
  flushErrors: flushSentry,
  createServer: http.createServer,
  process,
  console,
  setTimeout,
})
