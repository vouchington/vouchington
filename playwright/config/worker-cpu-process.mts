import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { formatQueueIncludeList } from '../../backend/modules/worker-queue-inventory/worker-queue-policy.mts'

export interface WorkerCpuHandle {
  waitForLog(pattern: string, timeoutMs: number): Promise<void>
  stop(): Promise<void>
}

// This process backs only the credentialed suite (chat.spec.mts), which needs the
// ai_agents queue consumer used by the AI-agent/moderation
// proxy paths route through. Mirroring the full deployment profile here would also
// load unrelated CPU/IO consumers and their schedules (e.g. the every-minute
// bedrock-embeddings-batch dispatcher) against this suite's shared, real-credentialed
// stores — never a bounded, deterministic test process.
const CREDENTIALED_WORKER_CPU_QUEUES = ['ai_agents']

export async function startWorkerCpu(logDir: string): Promise<WorkerCpuHandle> {
  await mkdir(logDir, { recursive: true })
  const logPath = join(logDir, 'worker-cpu.log')
  const logStream = createWriteStream(logPath, { flags: 'a' })

  const queues = formatQueueIncludeList(CREDENTIALED_WORKER_CPU_QUEUES)

  const child = spawn('node', ['backend/entrypoints/worker-cpu/serve.mts'], {
    env: {
      ...process.env,
      QUEUES: queues,
      NODE_ENV: 'test',
      PLAYWRIGHT_TEST: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.pipe(logStream)
  child.stderr.pipe(logStream)

  const MAX_LOG_LINES = 1000
  const logLines: string[] = []
  let stdoutTail = ''
  let stderrTail = ''
  function pushLines(buffer: string, tail: string): string {
    const parts = (tail + buffer).split('\n')
    const newTail = parts.pop() ?? ''
    if (parts.length > 0) {
      logLines.push(...parts)
      if (logLines.length > MAX_LOG_LINES) {
        logLines.splice(0, logLines.length - MAX_LOG_LINES)
      }
    }
    return newTail
  }
  child.stdout.on('data', (chunk: Buffer) => {
    stdoutTail = pushLines(chunk.toString(), stdoutTail)
  })
  child.stderr.on('data', (chunk: Buffer) => {
    stderrTail = pushLines(chunk.toString(), stderrTail)
  })

  let exited = false
  child.on('exit', () => {
    exited = true
  })

  function onProcessExit() {
    if (!exited) child.kill('SIGKILL')
  }
  function onSigint() {
    if (!exited) child.kill('SIGKILL')
    process.exit(130)
  }
  function onSigterm() {
    if (!exited) child.kill('SIGKILL')
    process.exit(143)
  }
  process.on('exit', onProcessExit)
  process.on('SIGINT', onSigint)
  process.on('SIGTERM', onSigterm)

  function waitForLog(pattern: string, timeoutMs: number): Promise<void> {
    if (logLines.some(line => line.includes(pattern))) return Promise.resolve()
    if (exited) {
      return Promise.reject(
        new Error(`worker-cpu exited before log line "${pattern}". Log:\n${logLines.join('\n')}`),
      )
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(
          new Error(
            `Timed out waiting for worker-cpu log line "${pattern}" after ${timeoutMs}ms. Log:\n${logLines.join('\n')}`,
          ),
        )
      }, timeoutMs)

      function onData() {
        if (logLines.some(line => line.includes(pattern))) {
          cleanup()
          resolve()
        }
      }

      function onExit() {
        cleanup()
        reject(
          new Error(`worker-cpu exited before log line "${pattern}". Log:\n${logLines.join('\n')}`),
        )
      }

      function cleanup() {
        clearTimeout(timer)
        child.stdout.off('data', onData)
        child.stderr.off('data', onData)
        child.off('exit', onExit)
      }

      child.stdout.on('data', onData)
      child.stderr.on('data', onData)
      child.on('exit', onExit)
    })
  }

  async function stop(): Promise<void> {
    if (exited) return
    child.kill('SIGTERM')
    await new Promise<void>(resolve => {
      let settled = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const settle = () => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        // `settled` guards the timeout/exit race
        resolve()
      }
      timer = setTimeout(() => {
        if (!exited) child.kill('SIGKILL')
        // Resolve at kill-dispatch rather than waiting for `exit`: a child stuck past SIGKILL must not hang stop(); `settled` keeps the later exit listener a no-op.
        settle()
      }, 10_000)
      child.on('exit', settle)
    })
    logStream.end()
    process.off('exit', onProcessExit)
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
  }

  return { waitForLog, stop }
}
