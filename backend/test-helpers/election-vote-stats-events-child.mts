import { Worker, type Job, type WorkerOptions } from 'glide-mq'
import { createOwnedWorkerFailures } from './election-vote-stats-worker-errors.mts'

type Start = { name: string; options: WorkerOptions }
const send = (message: object) =>
  new Promise<void>((resolve, reject) => {
    if (!process.send) return reject(new Error('Owned worker IPC is unavailable'))
    process.send(message, error => (error ? reject(error) : resolve()))
  })
const startup = Promise.withResolvers<unknown>()
const disconnected = () =>
  startup.reject(new Error('Owned worker parent disconnected before startup'))
process.once('disconnect', disconnected)
process.once('message', startup.resolve)
if (!process.connected) disconnected()
const input = await startup.promise
process.off('disconnect', disconnected)
if (!input || typeof input !== 'object' || !('name' in input) || !('options' in input))
  throw new Error('Expected owned worker startup')
const { name, options } = input as Start
const stop = Promise.withResolvers<void>()
void stop.promise.catch(() => {})
const deliveries: Promise<void>[] = []
let worker: Worker | undefined
let primary: unknown
let hasPrimary = false
const failures = createOwnedWorkerFailures()
const deliver = (message: object) => {
  const delivery = send(message)
  deliveries.push(delivery)
  void delivery.catch(err => stop.reject(err))
}
process.once('disconnect', () => stop.reject(new Error('Owned worker parent disconnected')))
process.on('message', message => {
  if (message === 'close') stop.resolve()
  else stop.reject(new Error('Unexpected owned worker command'))
})
try {
  worker = new Worker(
    name,
    async (job: Job) => {
      if (job.name === 'failed') throw new Error('Owned worker processor failure')
      return { workerPid: process.pid }
    },
    { ...options, blockTimeout: 100 },
  )
  worker.on('error', error => {
    failures.record(error)
    stop.reject(error)
  })
  worker.on('completed', job => deliver({ type: 'completed', id: job.id, pid: process.pid }))
  worker.on('failed', job => deliver({ type: 'failed', id: job?.id, pid: process.pid }))
  await worker.waitUntilReady()
  await send({ type: 'ready', pid: process.pid })
  await stop.promise
} catch (err) {
  primary = err
  hasPrimary = true
} finally {
  if (worker) {
    const [closed] = await Promise.allSettled([Promise.resolve().then(() => worker!.close(false))])
    if (closed?.status === 'rejected') failures.record(closed.reason)
  }
  for (const delivery of deliveries) {
    const [result] = await Promise.allSettled([delivery])
    if (result?.status === 'rejected') failures.record(result.reason)
  }
  try {
    if (process.connected && process.disconnect) process.disconnect()
  } catch (err) {
    failures.record(err)
  }
}
failures.finish(hasPrimary ? { error: primary } : undefined)
