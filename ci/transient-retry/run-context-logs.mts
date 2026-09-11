import type { JobEntry } from './attempts.mts'
import {
  ghApi,
  LOG_MAX_BUFFER_BYTES,
  LOG_TOTAL_MAX_BUFFER_BYTES,
  isRetryableGhApiError,
  streamGhApiLog,
  type GhApiExecFile,
} from './gh-api.mts'
import { fitDiagnosticWindow, LOG_OMISSION_MARKER } from './run-context-log-window.mts'

interface LogFetcherOptions {
  allJobEntries: JobEntry[]
  execFile: GhApiExecFile
  rawJobEntries: JobEntry[]
  repository: string
  sleep?: (ms: number) => Promise<void>
  streamLog?: (path: string) => AsyncIterable<Buffer>
  streamLogs?: boolean
}

const LOG_HEAD_BYTES = 256 * 1024
const LOG_TAIL_BYTES = 512 * 1024

export function createLogFetchers({
  allJobEntries,
  execFile,
  rawJobEntries,
  repository,
  sleep,
  streamLog = streamGhApiLog,
  streamLogs = false,
}: LogFetcherOptions): {
  failedJobLogs: () => Promise<Map<string, string>>
  failedJobLogFetchFailures: () => Promise<Set<string>>
  jobLogs: (jobNames: string[]) => Promise<Map<string, string>>
} {
  let cachedFailedLogs: Map<string, string> | null = null
  const cachedJobLogs = new Map<string, string>()
  const inFlightJobLogs = new Map<string, Promise<string>>()
  const jobsByName = new Map(allJobEntries.map(job => [job.name, job]))
  const logFetchFailures = new Set<string>()
  let retainedLogBytes = 0
  let logFetchTail = Promise.resolve()

  const collectDiagnosticWindow = async (stream: AsyncIterable<Buffer>): Promise<string> => {
    const head: Buffer[] = []
    const tail: Buffer[] = []
    let headBytes = 0
    let tailBytes = 0
    let totalBytes = 0
    for await (const raw of stream) {
      totalBytes += raw.byteLength
      if (headBytes < LOG_HEAD_BYTES) {
        const part = raw.subarray(0, LOG_HEAD_BYTES - headBytes)
        head.push(part)
        headBytes += part.byteLength
      }
      tail.push(raw)
      tailBytes += raw.byteLength
      while (tailBytes > LOG_TAIL_BYTES) {
        const first = tail[0]!
        const excess = tailBytes - LOG_TAIL_BYTES
        if (first.byteLength <= excess) {
          tail.shift()
          tailBytes -= first.byteLength
        } else {
          tail[0] = first.subarray(excess)
          tailBytes -= excess
        }
      }
    }
    const truncated = totalBytes > LOG_HEAD_BYTES + LOG_TAIL_BYTES
    const overlapBytes = truncated ? 0 : Math.max(0, headBytes + tailBytes - totalBytes)
    let remainingOverlap = overlapBytes
    const nonOverlappingTail = tail.flatMap(part => {
      if (remainingOverlap === 0) return [part]
      if (part.byteLength <= remainingOverlap) {
        remainingOverlap -= part.byteLength
        return []
      }
      const result = part.subarray(remainingOverlap)
      remainingOverlap = 0
      return [result]
    })
    return (
      Buffer.concat(head).toString('utf8') +
      (truncated ? LOG_OMISSION_MARKER : '') +
      Buffer.concat(nonOverlappingTail).toString('utf8')
    )
  }

  const collectStreamedLog = async (path: string, maxRetainedBytes: number): Promise<string> => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        // A fresh collector per attempt drops partial diagnostics from a failed stream.
        const log = await collectDiagnosticWindow(streamLog(path))
        return fitDiagnosticWindow(log, maxRetainedBytes)
      } catch (error) {
        if (attempt === 3 || !isRetryableGhApiError(error)) throw error
        await (sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(attempt * 1000)
      }
    }
    throw new Error('Unreachable streamed job-log retry state')
  }

  const fetchLogWithinBudget = async (job: JobEntry): Promise<string> => {
    const cached = cachedJobLogs.get(job.name)
    if (cached !== undefined) return cached

    try {
      const remainingBytes = LOG_TOTAL_MAX_BUFFER_BYTES - retainedLogBytes
      if (remainingBytes <= 0) {
        logFetchFailures.add(job.name)
        cachedJobLogs.set(job.name, '')
        return ''
      }
      const path = `repos/${repository}/actions/jobs/${job.id}/logs`
      const log = streamLogs
        ? await collectStreamedLog(path, remainingBytes)
        : (
            await ghApi([path], {
              execFile,
              maxBuffer: Math.min(LOG_MAX_BUFFER_BYTES, remainingBytes),
              sleep,
            })
          ).stdout
      retainedLogBytes += Buffer.byteLength(log)
      cachedJobLogs.set(job.name, log)
      return log
    } catch {
      logFetchFailures.add(job.name)
      cachedJobLogs.set(job.name, '')
      return ''
    }
  }

  const fetchLog = (job: JobEntry): Promise<string> => {
    const cached = cachedJobLogs.get(job.name)
    if (cached !== undefined) return Promise.resolve(cached)
    const inFlight = inFlightJobLogs.get(job.name)
    if (inFlight) return inFlight

    const fetch = logFetchTail.then(() => fetchLogWithinBudget(job))
    const settled = fetch.finally(() => inFlightJobLogs.delete(job.name))
    inFlightJobLogs.set(job.name, settled)
    logFetchTail = settled.then(
      () => undefined,
      () => undefined,
    )
    return settled
  }

  const failedJobLogs = async (): Promise<Map<string, string>> => {
    if (cachedFailedLogs !== null) return cachedFailedLogs
    cachedFailedLogs = new Map()
    // Fetch sequentially: a workflow with many failed jobs must not retain a
    // full log-sized Buffer for every in-flight `gh api` process.
    for (const job of rawJobEntries) {
      cachedFailedLogs.set(job.name, await fetchLog(job))
    }
    return cachedFailedLogs
  }

  const jobLogs = async (jobNames: string[]): Promise<Map<string, string>> => {
    const logMap = new Map<string, string>()
    for (const jobName of jobNames) {
      const job = jobsByName.get(jobName)
      const log = job === undefined ? '' : await fetchLog(job)
      logMap.set(jobName, log)
    }
    return logMap
  }

  const failedJobLogFetchFailures = async (): Promise<Set<string>> => new Set(logFetchFailures)

  return { failedJobLogs, failedJobLogFetchFailures, jobLogs }
}
