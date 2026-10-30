import { EventEmitter } from 'node:events'
import { Worker, type Job, type Processor, type WorkerOptions } from 'glide-mq'

/**
 * A `psql` worker that fetches only while this test has admitted job ids.
 * Claims for any other id are returned to waiting. Completion does not pull the
 * next stream entry, so a neighboring job is not run or delayed.
 */
export class OwnedJobWorker extends Worker {
  private readonly wake = new EventEmitter()
  private readonly owned = new Set<string>()
  private started = false

  constructor(name: string, processor: Processor, opts: WorkerOptions) {
    super(name, processor, opts)
    const run = this.processor
    this.processor = async (job: Job) => {
      try {
        return await run(job)
      } finally {
        // Skip complete-and-fetch-next so this slot cannot claim a neighbor.
        this.paused = true
      }
    }
    this.started = true
  }

  admit(jobId: string): void {
    this.owned.add(jobId)
    this.wake.emit('wake')
  }

  release(jobId: string): void {
    this.owned.delete(jobId)
  }

  protected override async pollLoop(): Promise<void> {
    // Base init starts the loop before subclass fields exist. Yield once.
    await Promise.resolve()
    while (this.running && !this.closing) {
      try {
        await this.pollOnce()
      } catch (err) {
        if (!this.running || this.closing) return
        this.emit('error', err instanceof Error ? err : new Error(String(err)))
        await this.sleepUnlessClosing(50)
      }
    }
  }

  protected override async pollOnce(): Promise<void> {
    await Promise.resolve()
    if (!this.started || this.closing) return
    if (this.paused || this.owned.size === 0) {
      await this.waitForWake()
      return
    }
    await super.pollOnce()
  }

  protected override async processJob(jobId: string, entryId: string): Promise<void> {
    if (!this.owned.has(jobId)) {
      await this.deferOutOfOrderJob(jobId, entryId)
      return
    }
    try {
      await super.processJob(jobId, entryId)
    } finally {
      this.paused = false
      this.wake.emit('wake')
    }
  }

  private waitForWake(): Promise<void> {
    if (this.closing || (!this.paused && this.owned.size > 0)) return Promise.resolve()
    return new Promise(resolve => {
      let settled = false
      const onWake = () => {
        if (settled) return
        if (!this.closing && (this.paused || this.owned.size === 0)) return
        settled = true
        this.wake.off('wake', onWake)
        this.off('closing', onWake)
        resolve()
      }
      this.wake.on('wake', onWake)
      this.on('closing', onWake)
      onWake()
    })
  }
}
