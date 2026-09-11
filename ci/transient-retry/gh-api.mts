import { spawn } from 'node:child_process'
import { setTimeout as sleepFor } from 'node:timers/promises'

import { GO_NET_HTTP_TRANSPORT_TRANSIENT_ERROR_MARKERS } from './aws-transport-fingerprints.mts'

export type GhApiExecFile = (
  command: string,
  args: string[],
  options: { maxBuffer: number },
) => Promise<{ stdout: string; stderr: string }>

// Storybook browser DEBUG=pw:protocol logs can exceed 40 MiB before the
// terminal failure summary that transient rules need to inspect.
export const LOG_MAX_BUFFER_BYTES = 64 * 1024 * 1024
// A rule run may inspect several failed jobs. Keep the aggregate bounded even
// when each individual job has verbose browser-protocol diagnostics.
export const LOG_TOTAL_MAX_BUFFER_BYTES = 16 * 1024 * 1024

export function ghApiLogArgs(path: string): string[] {
  return ['api', '--allow-escape-sequences', path]
}

export async function* streamGhApiLog(path: string): AsyncGenerator<Buffer> {
  const child = spawn('gh', ghApiLogArgs(path), { stdio: ['ignore', 'pipe', 'pipe'] })
  const completed = new Promise<{ code: number | null; stderr: Buffer }>((resolve, reject) => {
    const stderr: Buffer[] = []
    let stderrBytes = 0
    child.stderr.on('data', chunk => {
      if (stderrBytes >= 64 * 1024) return
      const part = Buffer.from(chunk).subarray(0, 64 * 1024 - stderrBytes)
      stderr.push(part)
      stderrBytes += part.byteLength
    })
    child.once('error', reject)
    child.once('close', code => resolve({ code, stderr: Buffer.concat(stderr) }))
  })
  for await (const chunk of child.stdout) yield Buffer.from(chunk)
  const { code, stderr } = await completed
  if (code !== 0) throw new Error(`gh api ${path} exited with status ${String(code)}: ${stderr}`)
}

function errorText(error: unknown): string {
  const parts: string[] = []
  const pushPart = (part: string) => {
    if (!parts.includes(part)) parts.push(part)
  }
  const messageAlreadyExtracted = error instanceof Error
  if (typeof error === 'string') {
    pushPart(error)
  } else if (messageAlreadyExtracted) {
    pushPart(error.message)
  }
  if (typeof error === 'object' && error !== null) {
    const obj = error as { message?: unknown; stderr?: unknown; stdout?: unknown }
    if (typeof obj.message === 'string' && !messageAlreadyExtracted) {
      pushPart(obj.message)
    }
    if (typeof obj.stderr === 'string') pushPart(obj.stderr)
    if (typeof obj.stdout === 'string') pushPart(obj.stdout)
  }
  return parts.join('\n')
}

export function isRetryableGhApiError(error: unknown): boolean {
  const text = errorText(error)
  return GO_NET_HTTP_TRANSPORT_TRANSIENT_ERROR_MARKERS.some(marker => text.includes(marker))
}

interface GhApiOptions {
  attempts?: number
  execFile: GhApiExecFile
  maxBuffer?: number
  sleep?: (ms: number) => Promise<void>
}

export async function ghApi(
  args: string[],
  { attempts = 3, execFile, maxBuffer = LOG_MAX_BUFFER_BYTES, sleep = sleepFor }: GhApiOptions,
): Promise<{ stdout: string; stderr: string }> {
  if (attempts < 1) throw new Error(`Invalid gh api retry attempts: ${attempts}`)

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await execFile('gh', ['api', ...args], { maxBuffer })
    } catch (error) {
      if (attempt === attempts || !isRetryableGhApiError(error)) throw error
      console.error(
        `::warning::gh api attempt ${attempt}/${attempts} failed (${errorText(error).replace(/\n/g, ' ')}); retrying`,
      )
      await sleep(attempt * 1000)
    }
  }

  throw new Error('Unreachable gh api retry state')
}
