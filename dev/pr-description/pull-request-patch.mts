import { DiffCommandError } from 'vouchington-tooling/gh-cli'
import type { RunGh } from './issue-closure.mts'
import type { PullRequestIdentity } from './validate.mts'
import { createDiffSummary, reduceDiffBlock, type DiffSummary } from './diff-summary.mts'

type PullRequestFile = {
  filename: string
  patch?: string
  previous_filename?: string
  status: 'added' | 'copied' | 'modified' | 'removed' | 'renamed'
}

const PULL_REQUEST_FILES_PAGE_SIZE = 20
const MAX_PULL_REQUEST_FILES_PAGES = 150

function patchHeader(file: PullRequestFile): string[] {
  const previous = file.previous_filename ?? file.filename
  const lines = [`diff --git a/${previous} b/${file.filename}`]
  if (file.status === 'removed') {
    lines.push('deleted file mode 100644', `--- a/${file.filename}`, '+++ /dev/null')
  } else if (file.status === 'added') {
    lines.push('new file mode 100644', '--- /dev/null', `+++ b/${file.filename}`)
  } else {
    if (file.status === 'renamed' && file.previous_filename !== undefined) {
      lines.push(`rename from ${file.previous_filename}`, `rename to ${file.filename}`)
    }
    lines.push(`--- a/${previous}`, `+++ b/${file.filename}`)
  }
  return lines
}

/**
 * `gh pr diff` returns HTTP 406 for GitHub pull requests whose unified patch exceeds its 20,000-line
 * response limit. The files API remains available, and its patches retain removed exports while its
 * metadata preserves file, route, rename, and package-manifest removal detection. A missing patch
 * still emits a valid header so the supersession audit checks the changed package manifest and
 * deleted file surfaces instead of silently disabling itself.
 */
export type PullRequestPatch = {
  summary: DiffSummary
  source: 'files-api' | 'unified-diff'
}

export type ProcessPullRequestDiff = (
  onBlock: (block: string) => void | Promise<void>,
) => Promise<void>

async function readPullRequestFileSummary(
  runGh: RunGh,
  target: PullRequestIdentity,
): Promise<DiffSummary> {
  const summary = createDiffSummary()
  let fileCount = 0
  for (let page = 1; page <= MAX_PULL_REQUEST_FILES_PAGES; page++) {
    // oxlint-disable-next-line no-await-in-loop -- the next page exists only after this page fills.
    const json = await runGh([
      'api',
      `repos/${target.owner}/${target.repo}/pulls/${target.number}/files`,
      '-X',
      'GET',
      '-F',
      `per_page=${PULL_REQUEST_FILES_PAGE_SIZE}`,
      '-F',
      `page=${page}`,
    ])
    const batch = JSON.parse(json) as PullRequestFile[]
    for (const file of batch)
      reduceDiffBlock(summary, [...patchHeader(file), file.patch ?? ''].join('\n'))
    fileCount += batch.length
    if (batch.length < PULL_REQUEST_FILES_PAGE_SIZE) return summary
  }
  const changedFiles = Number(
    await runGh([
      'api',
      `repos/${target.owner}/${target.repo}/pulls/${target.number}`,
      '--jq',
      '.changed_files',
    ]),
  )
  if (Number.isSafeInteger(changedFiles) && changedFiles === fileCount) return summary
  throw new Error(`PR files API returned only ${fileCount} of ${changedFiles} changed files`)
}

export async function readPullRequestPatch(
  processUnifiedDiff: ProcessPullRequestDiff,
  runGh: RunGh,
  target: PullRequestIdentity,
): Promise<PullRequestPatch> {
  try {
    const summary = createDiffSummary()
    await processUnifiedDiff(block => {
      reduceDiffBlock(summary, block)
    })
    return { summary, source: 'unified-diff' }
  } catch (err: unknown) {
    if (!(err instanceof DiffCommandError)) throw err
    try {
      const summary = await readPullRequestFileSummary(runGh, target)
      return { summary, source: 'files-api' }
    } catch {
      throw err
    }
  }
}
