import { randomBytes } from 'node:crypto'
import app, { createOriginGuardedListener } from '../api/app.mts'
import { withOwnedApiServer } from './api-query-options-server.mts'
import { createRequest } from './api/server.mts'

/** Exercise trusted Cloudflare score handling through the real Worker origin guard. */
export function withTrustedLowScoreRequest<Result>(
  run: (request: ReturnType<typeof createRequest>) => Promise<Result>,
): Promise<Result> {
  const workerSecret = randomBytes(32).toString('hex')
  return withOwnedApiServer(
    createOriginGuardedListener(app.callback(), workerSecret),
    app,
    address => {
      const request = createRequest(address)
      request.set('x-cf-worker-secret', workerSecret)
      request.set('x-voucha-bot-score', '7')
      return run(request)
    },
  )
}
