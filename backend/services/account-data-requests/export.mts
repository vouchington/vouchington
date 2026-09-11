import { createWriteStream } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { stringify } from 'csv-stringify'
import {
  streamProfile,
  streamPosts,
  streamVotes,
  streamEmails,
  streamPhones,
  streamPasskeys,
} from './stream.mts'
import { streamOAuthAccounts } from './stream-oauth.mts'
import { streamEntityRelations } from './stream-entity-relations.mts'
import { streamBookmarks } from './stream-bookmarks.mts'
import { streamConsents, streamReferralAttributions } from './stream-consents.mts'
import { streamFollowedRssFeeds } from './stream-followed-rss-feeds.mts'
import { streamFollowedTopics } from './stream-followed-topics.mts'
import { mergeCsvFiles } from './export-merge.mts'
export { mergeCsvFiles } from './export-merge.mts'
export { writeLineWithBackpressure } from './export-utils.mts'
import { endWriteStream } from './export-utils.mts'
export { zipDir } from './export-zip.mts'

const EXPORT_CSV_STRINGIFY_OPTIONS = {
  header: true,
  cast: {
    boolean(value: boolean): string {
      return value ? 'true' : 'false'
    },
  },
}

const RELATION_CSV_HEADER_LINE = 'object_id,object_label,predicate,created_at\n'
const BOOKMARK_CSV_HEADER_LINE = 'object_id,predicate,created_at\n'

/** Writes all export CSVs into exportDir. */
export async function writeExportFiles(userId: string, exportDir: string): Promise<void> {
  // ast-grep-ignore: no-three-sequential-awaits -- serial CSV writes keep each cursor drain exclusive
  await mkdir(exportDir)
  await writeCsvFromGenerator(join(exportDir, 'profile.csv'), streamProfile(userId))
  await writeCsvFromGenerator(join(exportDir, 'posts.csv'), streamPosts(userId))
  await writeCsvFromGenerator(join(exportDir, 'votes.csv'), streamVotes(userId))
  await writeCsvFromGenerator(join(exportDir, 'emails.csv'), streamEmails(userId))
  await writeCsvFromGenerator(join(exportDir, 'phones.csv'), streamPhones(userId))
  await writeCsvFromGenerator(join(exportDir, 'oauth-accounts.csv'), streamOAuthAccounts(userId))
  await writeCsvFromGenerator(join(exportDir, 'passkeys.csv'), streamPasskeys(userId))
  await writeCsvFromGenerator(join(exportDir, 'consents.csv'), streamConsents(userId))
  await writeCsvFromGenerator(
    join(exportDir, 'referral-attributions.csv'),
    streamReferralAttributions(userId),
  )
  await writeCsvFromGenerator(
    join(exportDir, 'followed-rss-feeds.csv'),
    streamFollowedRssFeeds(userId),
  )
  await writeCsvFromGenerator(join(exportDir, 'followed-topics.csv'), streamFollowedTopics(userId))
  await writeBookmarksCsv(exportDir, userId)
  await writeEntityRelationsCsv(exportDir, userId)
}

async function writeEntityRelationsCsv(dir: string, userId: string): Promise<void> {
  const outPath = join(dir, 'entity-relations.csv')
  const tmpDir = join(dir, '_entity_relations_tmp')
  await mkdir(tmpDir)

  const streams = streamEntityRelations(userId)
  const tempFiles: string[] = []
  for (const stream of streams) {
    const tmpPath = join(tmpDir, `${stream.predicate}_${stream.objectType}.csv`)
    // oxlint-disable-next-line no-await-in-loop -- serial cursor drains release each PostgreSQL client before the next starts
    await writeCsvFromGenerator(tmpPath, stream.rows)
    tempFiles.push(tmpPath)
  }

  await mergeCsvFiles(outPath, tempFiles, RELATION_CSV_HEADER_LINE)
  await rm(tmpDir, { recursive: true })
}

async function writeBookmarksCsv(dir: string, userId: string): Promise<void> {
  const outPath = join(dir, 'bookmarks.csv')
  const tmpDir = join(dir, '_bookmarks_tmp')
  await mkdir(tmpDir)

  const streams = streamBookmarks(userId)
  const tempFiles: string[] = []
  for (const stream of streams) {
    const tmpPath = join(tmpDir, `${stream.predicate}_${stream.objectType}.csv`)
    // oxlint-disable-next-line no-await-in-loop -- serial cursor drains release each PostgreSQL client before the next starts
    await writeCsvFromGenerator(tmpPath, stream.rows)
    tempFiles.push(tmpPath)
  }

  await mergeCsvFiles(outPath, tempFiles, BOOKMARK_CSV_HEADER_LINE)
  await rm(tmpDir, { recursive: true })
}

export async function writeCsvFromGenerator(
  outPath: string,
  rows: AsyncGenerator<Record<string, unknown>>,
): Promise<void> {
  const firstRow = await rows.next()
  const writeStream = createWriteStream(outPath)
  if (firstRow.done) {
    await endWriteStream(writeStream)
    return
  }

  const stringifier = stringify(EXPORT_CSV_STRINGIFY_OPTIONS)
  await pipeline(
    (async function* () {
      yield firstRow.value
      for await (const row of rows) yield row
    })(),
    stringifier,
    writeStream,
  )
}
