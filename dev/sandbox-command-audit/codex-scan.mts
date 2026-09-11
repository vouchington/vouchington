import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { finished } from 'node:stream/promises'

import { asRecord } from '../retrospective-transcript-facts/compute-shared.mts'
import { openTranscriptLines } from '../retrospective-transcript-facts/resolve.mts'
import { createCodexRecordExtractor, type CodexExtraction } from './codex-extract.mts'
import { MAX_INHERITED_CODEX_SPOOL_BYTES } from './limits.mts'

export type CodexFileResult = CodexExtraction | { error: string }
export type CodexScanOptions = { spoolLimitBytes?: number }

async function openWriter(path: string): Promise<ReturnType<typeof createWriteStream>> {
  const writer = createWriteStream(path, { encoding: 'utf8' })
  try {
    await new Promise<void>((resolve, reject) => {
      const onOpen = (): void => {
        cleanup()
        resolve()
      }
      const onError = (error: Error): void => {
        cleanup()
        reject(error)
      }
      function cleanup(): void {
        writer.removeListener('open', onOpen)
        writer.removeListener('error', onError)
      }
      writer.once('open', onOpen)
      writer.once('error', onError)
    })
  } catch (error) {
    writer.destroy()
    throw error
  }
  // Keep later write failures observed until writeLine/closeWriter surface them.
  writer.on('error', () => undefined)
  return writer
}

async function writeLine(
  writer: ReturnType<typeof createWriteStream>,
  line: string,
): Promise<void> {
  if (writer.errored) throw writer.errored
  if (writer.write(`${line}\n`)) return
  await new Promise<void>((resolve, reject) => {
    const onDrain = (): void => {
      cleanup()
      resolve()
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }
    function cleanup(): void {
      writer.removeListener('drain', onDrain)
      writer.removeListener('error', onError)
    }
    writer.once('drain', onDrain)
    writer.once('error', onError)
  })
}

async function closeWriter(writer: ReturnType<typeof createWriteStream>): Promise<void> {
  if (writer.errored) throw writer.errored
  writer.end()
  await finished(writer)
  if (writer.errored) throw writer.errored
}

function inheritedSession(record: Record<string, unknown>): boolean {
  const payload = asRecord(record.payload)
  const source = asRecord(payload?.source)
  return (
    asRecord(source?.subagent) !== undefined ||
    typeof payload?.forked_from_id === 'string' ||
    typeof payload?.parent_thread_id === 'string' ||
    (typeof payload?.id === 'string' &&
      typeof payload.session_id === 'string' &&
      payload.id !== payload.session_id)
  )
}

function ownedTaskStarted(line: string, sessionSeconds: number): boolean {
  try {
    const record = asRecord(JSON.parse(line))
    const payload = asRecord(record?.payload)
    if (record?.type !== 'event_msg' || payload?.type !== 'task_started') return false
    if (typeof payload.started_at !== 'number') return false
    const seconds =
      payload.started_at >= 1_000_000_000_000 ? payload.started_at / 1000 : payload.started_at
    return seconds >= sessionSeconds
  } catch {
    return false
  }
}

// A forked Codex child duplicates inherited history before its first owned task_started.
// Prefix records are spooled under the supplied OS-temp root. Failed segmentation replays
// the whole spool incrementally, deliberately over-counting rather than dropping activity.
export async function scanCodexFile(
  file: string,
  tempRoot: string,
  options: CodexScanOptions = {},
): Promise<CodexFileResult> {
  const opened = await openTranscriptLines(file)
  if ('error' in opened) return { error: opened.error }
  const extractor = createCodexRecordExtractor()
  let first = true
  let sessionSeconds: number | undefined
  let writer: ReturnType<typeof createWriteStream> | undefined
  let spoolDir: string | undefined
  let spoolPath: string | undefined
  let segmented = false
  let spoolBytes = 0
  const spoolLimitBytes = options.spoolLimitBytes ?? MAX_INHERITED_CODEX_SPOOL_BYTES
  try {
    for await (const line of opened.lines) {
      if (first && line.trim()) {
        first = false
        try {
          const record = asRecord(JSON.parse(line))
          if (record?.type === 'session_meta') {
            const timestamp = asRecord(record.payload)?.timestamp
            const timestampMs = typeof timestamp === 'string' ? Date.parse(timestamp) : Number.NaN
            if (inheritedSession(record) && Number.isFinite(timestampMs)) {
              sessionSeconds = Math.floor(timestampMs / 1000)
              spoolDir = await mkdtemp(join(tempRoot, 'sandbox-audit-codex-'))
              spoolPath = join(spoolDir, 'inherited.jsonl')
              writer = await openWriter(spoolPath)
            } else if (!inheritedSession(record)) continue
          }
        } catch {
          // Malformed metadata follows the legacy full-file fallback.
        }
      }
      if (writer && sessionSeconds !== undefined) {
        spoolBytes += Buffer.byteLength(line) + 1
        if (spoolBytes > spoolLimitBytes) {
          throw new Error(`inherited Codex spool exceeds ${spoolLimitBytes} byte limit`)
        }
        await writeLine(writer, line)
        if (!ownedTaskStarted(line, sessionSeconds)) continue
        await closeWriter(writer)
        writer = undefined
        await rm(spoolDir!, { recursive: true, force: true })
        spoolDir = undefined
        spoolPath = undefined
        segmented = true
      }
      if (segmented || !writer) extractor.pushLine(line)
    }
    if (writer && spoolPath) {
      await closeWriter(writer)
      writer = undefined
      const replay = await openTranscriptLines(spoolPath)
      if ('error' in replay) return { error: replay.error }
      for await (const line of replay.lines) extractor.pushLine(line)
    }
    return extractor.result()
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  } finally {
    if (writer) writer.destroy()
    if (spoolDir) await rm(spoolDir, { recursive: true, force: true })
  }
}
