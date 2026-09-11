import type { Job } from 'glide-mq'
import { getDeployEnvironment, type DeployEnvironmentSource } from '@ts-shared/deploy-environment'

const RESET = '\x1b[0m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED = '\x1b[31m'
const ORANGE = '\x1b[38;5;208m'

const DEFAULT_THRESHOLDS = { yellow: 50, orange: 250, red: 500 }
const MAX_DATA_LENGTH = 120

export interface WorkerLoggerOptions {
  timingThresholds?: { yellow: number; orange: number; red: number }
  // Explicit deploy-environment source, so tests can pin ENVIRONMENT/NODE_ENV per instance
  // instead of mutating the ambient process.env (which leaks across parallel Vitest files).
  // Defaults to process.env for real worker boot.
  env?: DeployEnvironmentSource
}

export class WorkerLogger {
  private enabled: boolean
  private level: 'error' | 'info'
  private thresholds: typeof DEFAULT_THRESHOLDS
  private startTimes = new Map<string, bigint>()

  constructor(options: WorkerLoggerOptions = {}) {
    // Verbose per-job logging is dev-only: off on staging and production (deployed), and off
    // under vitest ('test'), so 'development' is the only enabled value.
    this.enabled = getDeployEnvironment(options.env ?? process.env) === 'development'
    this.level = process.env.LOG_LEVEL === 'info' ? 'info' : 'error'
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...options.timingThresholds }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  onActive(queueName: string, job: Job): void {
    if (!this.enabled) return
    // Track start time even in error-only mode so onFailed has accurate timing.
    const key = `${queueName}:${job.id}`
    this.startTimes.set(key, process.hrtime.bigint())
  }

  onCompleted(queueName: string, job: Job): void {
    if (!this.enabled) return
    const key = `${queueName}:${job.id}`
    if (this.level === 'error') {
      this.startTimes.delete(key)
      return
    }

    const ms = this.getElapsedMs(key, job)
    this.startTimes.delete(key)

    const label = `${queueName}/${job.name}`
    const data = formatData(job.data)
    this.print(`${GREEN} ok${RESET}`, this.colorTiming(ms, this.formatTiming(ms)), label, data)
  }

  onFailed(queueName: string, job: Job, error: unknown): void {
    if (!this.enabled) return

    const key = `${queueName}:${job.id}`
    const ms = this.getElapsedMs(key, job)
    this.startTimes.delete(key)

    const label = `${queueName}/${job.name}`
    const data = formatData(job.data)
    const errMsg = formatError(error)
    this.print(
      `${RED}ERR${RESET}`,
      this.colorTiming(ms, this.formatTiming(ms)),
      label,
      data,
      errMsg,
    )
  }

  private getElapsedMs(key: string, job: Job): number {
    const startTime = this.startTimes.get(key)
    if (startTime !== undefined) {
      return Number(process.hrtime.bigint() - startTime) / 1_000_000
    }
    // Fallback to job timestamps
    if (job.processedOn && job.finishedOn) return job.finishedOn - job.processedOn
    return 0
  }

  private print(
    statusStr: string,
    timingStr: string,
    label: string,
    data: string,
    err?: string,
  ): void {
    const suffix = err ? ` ${err}` : ''
    process.stdout.write(`${statusStr} ${timingStr} ${label} ${data}${suffix}\n`)
  }

  private formatTiming(ms: number): string {
    return `${Math.round(ms)}ms`.padStart(5, ' ')
  }

  private colorTiming(ms: number, str: string): string {
    if (ms >= this.thresholds.red) return `${RED}${str}${RESET}`
    if (ms >= this.thresholds.orange) return `${ORANGE}${str}${RESET}`
    if (ms >= this.thresholds.yellow) return `${YELLOW}${str}${RESET}`
    return str
  }
}

function formatData(data: unknown): string {
  try {
    const str = JSON.stringify(data)
    if (typeof str !== 'string') return String(str)
    if (str.length > MAX_DATA_LENGTH) return `${str.slice(0, MAX_DATA_LENGTH)}...`
    return str
  } catch {
    return '[unserializable]'
  }
}

function formatError(error: unknown): string {
  let full: string
  if (error instanceof Error) {
    const name = error.name || 'Error'
    const message = error.message || ''
    full = message ? `${name}: ${message}` : name
  } else if (typeof error === 'string') {
    full = error
  } else {
    try {
      full = String(error)
    } catch {
      full = '[unformattable error]'
    }
  }
  if (full.length > MAX_DATA_LENGTH) return `${full.slice(0, MAX_DATA_LENGTH)}...`
  return full
}
