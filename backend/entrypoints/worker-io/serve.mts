import http from 'node:http'
import { addGracefulShutdownCallback } from '@data-stores/graceful-shutdown'
import onError, { flushSentry } from '@modules/on-error'
import { validateRuntimeImageOrigin } from '@modules/utils/image-origin'
import workers, { sqsConsumers } from './index.mts'
import { registerWorkerServe } from './serve-runtime.mts'

validateRuntimeImageOrigin()

registerWorkerServe({
  workers: [...workers, ...sqsConsumers],
  addGracefulShutdownCallback,
  onError,
  flushSentry,
  createServer: http.createServer,
  process,
  console,
  setTimeout,
})
