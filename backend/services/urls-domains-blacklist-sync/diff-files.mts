import { createReadStream, createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { finished, pipeline } from 'node:stream/promises'
import { runCommand } from '@modules/child-process'
import { readNormalizedDomains } from './sync-utils.mts'

const SORT_BIN = '/usr/bin/sort'
const COMM_BIN = '/usr/bin/comm'
const DIFF_TIMEOUT_MS = 120_000

/** Stream normalized domains through `sort -u` without holding the list. */
export async function writeSortedDesiredDomains(
  response: Response,
  destination: string,
): Promise<void> {
  const download = `${destination}.download`
  try {
    await pipeline(Readable.from(normalizedDomainLines(response)), createWriteStream(download))
    await writeCommandOutput(
      SORT_BIN,
      ['-S', '32M', '-T', dirname(destination), '-u'],
      destination,
      createReadStream(download),
    )
  } finally {
    await rm(download, { force: true })
  }
}

/**
 * `comm -13` is desired-only (additions). `comm -23` is membership-only (removals).
 * Both inputs are already ordered with the C collation.
 */
export async function writeCommDiff(input: {
  membershipPath: string
  desiredPath: string
  addedPath: string
  removedPath: string
}): Promise<void> {
  await writeCommandOutput(
    COMM_BIN,
    ['-13', input.membershipPath, input.desiredPath],
    input.addedPath,
  )
  await writeCommandOutput(
    COMM_BIN,
    ['-23', input.membershipPath, input.desiredPath],
    input.removedPath,
  )
}

async function* normalizedDomainLines(response: Response): AsyncGenerator<string> {
  for await (const domain of readNormalizedDomains(response)) yield `${domain}\n`
}

async function writeCommandOutput(
  command: string,
  args: readonly string[],
  destination: string,
  stdin?: Readable,
): Promise<void> {
  const output = createWriteStream(destination)
  try {
    await runCommand({
      command,
      args,
      stdin,
      stdout: output,
      timeoutMs: DIFF_TIMEOUT_MS,
    })
    await finished(output)
  } catch (err) {
    output.destroy()
    throw err
  }
}
