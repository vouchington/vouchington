import { createReadStream } from 'node:fs'
import type { FeedListSourceType, ParsedFeedEntry } from './parse.mts'

export const FIELD_SEPARATOR = '\u001f'

export function numberedLine(entry: ParsedFeedEntry, lineNumber: number): string {
  const payload = JSON.stringify({
    name: entry.name,
    slug: entry.slug,
    sourceType: entry.sourceType,
  })
  return `${entry.feedUrl}${FIELD_SEPARATOR}${lineNumber}${FIELD_SEPARATOR}${payload}\n`
}

export async function* desiredLines(deduped: string): AsyncGenerator<string> {
  for await (const line of linesOf(deduped)) {
    const separator = line.indexOf(FIELD_SEPARATOR)
    if (separator !== -1) yield `${line.slice(0, separator)}\n`
  }
}

// Two readline interfaces in one process drop the second file's lines, so split chunks here.
export async function* linesOf(path: string): AsyncGenerator<string> {
  const stream = createReadStream(path)
  let pending = ''
  try {
    for await (const chunk of stream) {
      pending += Buffer.from(chunk).toString('utf8')
      let newline = pending.indexOf('\n')
      while (newline !== -1) {
        yield pending.slice(0, newline)
        pending = pending.slice(newline + 1)
        newline = pending.indexOf('\n')
      }
    }
    if (pending.length > 0) yield pending
  } finally {
    stream.destroy()
  }
}

export function entryFromLine(line: string): ParsedFeedEntry | null {
  const first = line.indexOf(FIELD_SEPARATOR)
  const second = first === -1 ? -1 : line.indexOf(FIELD_SEPARATOR, first + 1)
  if (second === -1) return null
  const payload = JSON.parse(line.slice(second + 1)) as {
    name: string
    slug: string
    sourceType: FeedListSourceType
  }
  return { feedUrl: line.slice(0, first), ...payload }
}
