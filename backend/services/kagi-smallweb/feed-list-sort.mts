import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { finished, pipeline } from 'node:stream/promises'
import { runCommand } from '@modules/child-process'
import { readPool } from '@data-stores/psql'
import { to as copyTo } from 'pg-copy-streams'
import { desiredLines, FIELD_SEPARATOR } from './feed-list-lines.mts'

const SORT_BIN = '/usr/bin/sort'
const COMM_BIN = '/usr/bin/comm'
const DIFF_TIMEOUT_MS = 120_000

/** Last line for each URL, then the URLs the reader does not already have. */
export async function sortAndDiff(numbered: string, directory: string): Promise<void> {
  const ordered = join(directory, 'ordered')
  const deduped = join(directory, 'deduped')
  const desired = join(directory, 'desired')
  const membership = join(directory, 'membership')
  const added = join(directory, 'added')
  await orderLastWins(numbered, ordered, deduped, desired, membership, directory)
  await keepNewUrls(desired, membership, added, [numbered, ordered, desired, membership])
}

async function orderLastWins(
  numbered: string,
  ordered: string,
  deduped: string,
  desired: string,
  membership: string,
  directory: string,
): Promise<void> {
  await sortDeduped(numbered, ordered, deduped, directory)
  await writeReaderFiles(deduped, desired, membership)
}

async function sortDeduped(
  numbered: string,
  ordered: string,
  deduped: string,
  directory: string,
): Promise<void> {
  const spill = ['-S', '32M', '-T', directory] as const
  await writeCommandOutput(
    SORT_BIN,
    [...spill, '-t', FIELD_SEPARATOR, '-k1,1', '-k2,2nr', numbered],
    ordered,
  )
  // Stable `-s` keeps the later line. Without it, a full-line tie keeps the earlier line number.
  await writeCommandOutput(
    SORT_BIN,
    ['-s', ...spill, '-t', FIELD_SEPARATOR, '-u', '-k1,1', ordered],
    deduped,
  )
}

async function writeReaderFiles(
  deduped: string,
  desired: string,
  membership: string,
): Promise<void> {
  await pipeline(Readable.from(desiredLines(deduped)), createWriteStream(desired))
  await copyExistingFeedUrls(membership)
}

async function keepNewUrls(
  desired: string,
  membership: string,
  added: string,
  removePaths: readonly string[],
): Promise<void> {
  await writeCommandOutput(COMM_BIN, ['-23', desired, membership], added)
  await Promise.all(removePaths.map(path => rm(path, { force: true })))
}

async function copyExistingFeedUrls(destination: string): Promise<void> {
  const client = await readPool.connect()
  try {
    const copy = client.query(
      copyTo(
        `/* copyExistingFeedUrls */
        COPY (
          SELECT encode(convert_to(urls.url, 'UTF8'), 'hex') AS url_hex FROM urls
          WHERE EXISTS (
            SELECT 1 FROM rss_feeds
            WHERE rss_feeds.rss_feed_url_id = urls.id AND rss_feeds.deleted_at IS NULL
          )
          ORDER BY urls.url COLLATE "C"
        ) TO STDOUT`,
      ),
    )
    await pipeline(Readable.from(decodedMembershipLines(copy)), createWriteStream(destination))
  } finally {
    client.release()
  }
}

async function* decodedMembershipLines(copy: Readable): AsyncGenerator<string> {
  // Text COPY escapes backslashes; hex contains only COPY-safe characters and
  // preserves the C-ordered UTF-8 bytes when decoded before comm.
  const rows = createInterface({ input: copy, crlfDelay: Infinity })
  try {
    for await (const hex of rows) yield `${Buffer.from(hex, 'hex').toString('utf8')}\n`
  } finally {
    rows.close()
  }
}

async function writeCommandOutput(
  command: string,
  args: readonly string[],
  destination: string,
): Promise<void> {
  const output = createWriteStream(destination)
  try {
    await runCommand({ command, args, stdout: output, timeoutMs: DIFF_TIMEOUT_MS })
    await finished(output)
  } catch (err) {
    output.destroy()
    throw err
  }
}
