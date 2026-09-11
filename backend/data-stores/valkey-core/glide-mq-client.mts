import { config } from './config.mts'

type WorkerQueueConnection = {
  addresses: Array<{ host: string; port: number }>
  useTLS?: boolean
  credentials?: {
    username?: string
    password: string
  }
}

export function buildWorkerQueueSettings(workerQueueUrl: string): {
  connection: WorkerQueueConnection
  prefix?: string
} {
  const url = new URL(workerQueueUrl)
  const dbPath = normalizeDbPath(url.pathname)

  const connection: WorkerQueueConnection = {
    addresses: [
      {
        host: url.hostname,
        port: Number(url.port || 6379),
      },
    ],
  }

  if (url.protocol === 'rediss:') {
    connection.useTLS = true
  }

  if (url.password) {
    connection.credentials = {
      ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
      password: decodeURIComponent(url.password),
    }
  }

  return {
    connection,
    ...(dbPath === undefined ? {} : { prefix: `voucha_qdb_${dbPath}` }),
  }
}

const workerQueueSettings = buildWorkerQueueSettings(config.worker_queue_url)
export const workerQueueConnection = workerQueueSettings.connection
export const workerQueuePrefix = workerQueueSettings.prefix

function normalizeDbPath(pathname: string): string | undefined {
  if (!pathname || pathname === '/') return undefined
  const db = pathname.replace(/^\/+/, '')
  if (db === '' || db === '0') return undefined
  if (!/^\d+$/.test(db)) {
    throw new Error(`Unsupported VALKEY_WORKER_QUEUE_URL path "${pathname}" for glide-mq`)
  }
  return db
}
