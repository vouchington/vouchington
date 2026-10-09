import http from 'node:http'
import { listenOnLoopbackEphemeralPort, type LoopbackHost } from '@ts-shared/utils/ephemeral-ports'
import { profileRequestQueries } from './api/request-query-profile.mts'

/** Real HTTP dispatch on an owned listener; inherited transaction ownership stays with the caller. */
export async function withOwnedApiServer<Result>(
  listener: (request: http.IncomingMessage, response: http.ServerResponse) => void,
  run: (address: { host: LoopbackHost; port: number }) => Promise<Result>,
): Promise<Result> {
  const responses: Promise<void>[] = []
  const server = http.createServer((req, res) => {
    const completed = new Promise<void>((resolve, reject) => {
      const finish = () => {
        cleanup()
        resolve()
      }
      const close = () => {
        cleanup()
        if (res.writableFinished) resolve()
        else reject(new Error('Owned API response closed before finishing'))
      }
      const error = (reason: Error) => {
        cleanup()
        reject(reason)
      }
      function cleanup() {
        res.off('finish', finish)
        res.off('close', close)
        res.off('error', error)
      }
      res.once('finish', finish)
      res.once('close', close)
      res.once('error', error)
    })
    void completed.catch(() => undefined)
    responses.push(completed)
    profileRequestQueries(req, res, () => listener(req, res))
  })
  const serverErrors: unknown[] = []
  const observeServerError = (error: Error) => {
    serverErrors.push(error)
  }
  server.on('error', observeServerError)
  let failed = false
  let primary: unknown
  let result: Result | undefined
  const failures: unknown[] = []
  try {
    const address = await listenOnLoopbackEphemeralPort(server)
    result = await run(address)
  } catch (err) {
    failed = true
    primary = err
  } finally {
    // Closing admission precedes the drain. Existing HTTP requests finish naturally.
    const closed = server.listening
      ? new Promise<void>((resolve, reject) =>
          server.close(error => (error ? reject(error) : resolve())),
        )
      : Promise.resolve()
    void closed.catch(() => undefined)
    for (const response of await Promise.allSettled(responses)) {
      if (response.status === 'rejected') failures.push(response.reason)
    }
    try {
      await closed
    } catch (err) {
      failures.push(err)
    }
    server.off('error', observeServerError)
    failures.push(...serverErrors)
  }
  if (failed && failures.length === 0) throw primary
  if (failed) failures.unshift(primary)
  if (failures.length) throw new AggregateError(failures, 'Owned API request cleanup failed')
  return result as Result
}
