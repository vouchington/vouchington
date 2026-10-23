import { execFile as execFileCallback } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { ghSpawnEnv } from 'vouchington-tooling/gh-cli'

import { trustedIssueAuthor } from './trusted-issue-author.mts'

const execFile = promisify(execFileCallback)

async function readIssue(path: string): Promise<unknown> {
  const { stdout } = await execFile('gh', ['api', '-X', 'GET', path], {
    env: ghSpawnEnv(),
    maxBuffer: 1024 * 1024,
    timeout: 10_000,
  })
  return JSON.parse(stdout) as unknown
}

export async function authorizedFixMainCandidates({
  json,
  repository,
  read = readIssue,
}: {
  json: string
  repository: string
  read?: (path: string) => Promise<unknown>
}): Promise<Record<string, unknown>[]> {
  const candidates = JSON.parse(json) as unknown
  if (!Array.isArray(candidates) || candidates.length > 10) {
    throw new Error('Expected at most ten related candidates')
  }
  const authorized: Record<string, unknown>[] = []
  for (const value of candidates) {
    if (typeof value !== 'object' || value === null) throw new Error('Invalid related candidate')
    const candidate = value as Record<string, unknown>
    if (candidate.kind === 'pr') {
      authorized.push(candidate)
      continue
    }
    if (
      candidate.kind !== 'issue' ||
      typeof candidate.number !== 'number' ||
      !Number.isSafeInteger(candidate.number) ||
      candidate.number <= 0
    ) {
      throw new Error('Invalid related issue candidate')
    }
    const live = (await read(`repos/${repository}/issues/${candidate.number}`)) as {
      number?: unknown
      html_url?: unknown
      state?: unknown
      pull_request?: unknown
      author_association?: unknown
    }
    if (
      live.number === candidate.number &&
      live.html_url === `https://github.com/${repository}/issues/${candidate.number}` &&
      live.html_url === candidate.url &&
      live.state === 'open' &&
      live.pull_request === undefined &&
      trustedIssueAuthor(live.author_association)
    ) {
      authorized.push(candidate)
    }
  }
  return authorized
}

if (import.meta.main) {
  const repository = process.env.GITHUB_REPOSITORY
  const output = process.env.GITHUB_OUTPUT
  if (!repository || !output) throw new Error('GITHUB_REPOSITORY and GITHUB_OUTPUT are required')
  const candidates = await authorizedFixMainCandidates({
    json: process.env.RELATED_CANDIDATES || '[]',
    repository,
  })
  await appendFile(output, `related-candidates=${JSON.stringify(candidates)}\n`)
}
