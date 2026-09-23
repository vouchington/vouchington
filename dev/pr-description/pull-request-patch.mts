import type { RunGh } from './issue-closure.mts'
import type { PullRequestIdentity } from './validate.mts'

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
  patch: string
  source: 'files-api' | 'unified-diff'
}

async function readPullRequestFiles(
  runGh: RunGh,
  target: PullRequestIdentity,
): Promise<PullRequestFile[]> {
  const files: PullRequestFile[] = []
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
    files.push(...batch)
    if (batch.length < PULL_REQUEST_FILES_PAGE_SIZE) return files
  }
  const changedFiles = Number(
    await runGh([
      'api',
      `repos/${target.owner}/${target.repo}/pulls/${target.number}`,
      '--jq',
      '.changed_files',
    ]),
  )
  if (Number.isSafeInteger(changedFiles) && changedFiles === files.length) return files
  throw new Error(`PR files API returned only ${files.length} of ${changedFiles} changed files`)
}

export async function readPullRequestPatch(
  runGh: RunGh,
  pr: string,
  target: PullRequestIdentity,
): Promise<PullRequestPatch> {
  try {
    return { patch: await runGh(['pr', 'diff', pr]), source: 'unified-diff' }
  } catch (diffError: unknown) {
    try {
      const files = await readPullRequestFiles(runGh, target)
      return {
        patch: files
          .flatMap(file => [...patchHeader(file), ...(file.patch?.split('\n') ?? [])])
          .join('\n'),
        source: 'files-api',
      }
    } catch {
      throw diffError
    }
  }
}
