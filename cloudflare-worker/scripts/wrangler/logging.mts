import { type WriteStream, createWriteStream, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createWranglerEvent, type WranglerEventExtra } from './config.mts'

export type { WranglerEventExtra }

type WranglerLogContext = {
  hasCerts: boolean
  inspectorPort: string
  isCi: boolean
  logLevel: string
  persistTo?: string
  workerPort: string
  workerdVersion: string
  wranglerVersion: string
}

export type WranglerLogStreams = {
  eventsLog: WriteStream | null
  stderrLog: WriteStream | null
  stdoutLog: WriteStream | null
}

const COSMETIC_LINE_RE = /^[\s]*[⎔╭╰│├┌└┐┘─┬┴┤├╮╯]\s*/

export function createWranglerLogStreams(workerLogDir: string | undefined): WranglerLogStreams {
  if (!workerLogDir) return { eventsLog: null, stderrLog: null, stdoutLog: null }
  mkdirSync(workerLogDir, { recursive: true })
  return {
    stdoutLog: createWriteStream(join(workerLogDir, 'wrangler-stdout.log')),
    stderrLog: createWriteStream(join(workerLogDir, 'wrangler-stderr.log')),
    eventsLog: createWriteStream(join(workerLogDir, 'wrangler-events.ndjson')),
  }
}

export function isCosmetic(line: string): boolean {
  if (COSMETIC_LINE_RE.test(line)) return true
  if (line.startsWith('[mf:')) return true
  return false
}

export function readPackageVersion(packageJsonPath: string): string {
  try {
    const contents = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: unknown }
    return typeof contents.version === 'string' ? contents.version : 'unknown'
  } catch {
    return 'unknown'
  }
}

export function prefixLines(text: string, prefix: string): string {
  return text
    .split('\n')
    .map(line => (line ? `${prefix} ${line}` : ''))
    .join('\n')
}

export async function flushLogs(streams: WranglerLogStreams): Promise<void> {
  await Promise.all([
    streams.stdoutLog ? new Promise<void>(done => streams.stdoutLog!.end(done)) : Promise.resolve(),
    streams.stderrLog ? new Promise<void>(done => streams.stderrLog!.end(done)) : Promise.resolve(),
    streams.eventsLog ? new Promise<void>(done => streams.eventsLog!.end(done)) : Promise.resolve(),
  ])
}

export function writeWranglerEvent(params: {
  context: WranglerLogContext
  event: string
  extra?: WranglerEventExtra
  restartCount: number
  streams: WranglerLogStreams
}): void {
  const { context, event, extra = {}, restartCount, streams } = params
  if (!streams.eventsLog) return
  streams.eventsLog.write(
    `${JSON.stringify(
      createWranglerEvent(
        {
          attempt: restartCount + 1,
          event,
          hasCerts: context.hasCerts,
          inspectorPort: context.inspectorPort,
          isCi: context.isCi,
          logLevel: context.logLevel,
          persistTo: context.persistTo,
          timestamp: new Date().toISOString(),
          workerPort: context.workerPort,
          workerdVersion: context.workerdVersion,
          wranglerVersion: context.wranglerVersion,
        },
        extra,
      ),
    )}\n`,
  )
}
