import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as load } from 'yaml'

export type WorkflowJob = {
  'runs-on'?: string | string[]
  env?: Record<string, string>
  needs?: string | string[]
  uses?: string
  with?: Record<string, unknown>
  secrets?: string | Record<string, unknown>
  if?: string
  outputs?: Record<string, string>
  permissions?: Record<string, string>
  'timeout-minutes'?: number | string
  steps?: Array<{
    name?: string
    id?: string
    if?: string
    uses?: string
    with?: Record<string, unknown>
    run?: string
    env?: Record<string, string>
    'continue-on-error'?: boolean
    'timeout-minutes'?: number | string
  }>
}

type Workflow = {
  on?: unknown
  permissions?: Record<string, string>
  jobs?: Record<string, WorkflowJob>
}

export const fixMain = readFileSync('.github/workflows/fix-main.yml', 'utf8')
export const harnessDispatch = readFileSync('.github/workflows/harness-dispatch.yml', 'utf8')
export const fixMainPrompt = readFileSync('docs/prompts/automation/fix-main.md', 'utf8')
export const parsedMain = load(fixMain) as Workflow
export const parsedDispatch = load(harnessDispatch) as Workflow

export function renderCodexFixMainPrompt(relatedCandidates: string) {
  const cwd = mkdtempSync(join(tmpdir(), 'fix-main-prompt-'))
  const outputPath = join(cwd, 'prompt.md')

  try {
    execFileSync(
      process.execPath,
      [
        'ci/render-harness-prompt.mts',
        '--template',
        'docs/prompts/automation/fix-main.md',
        '--output',
        outputPath,
        '--var',
        'WORKFLOW_NAME=CI',
        '--var',
        'RUN_URL=https://github.com/vouchington/vouchington/actions/runs/123',
        '--var',
        'RUN_ID=123',
        '--var',
        'COMMIT_SHA=abcdef123456',
        '--var',
        `RELATED_CANDIDATES=${relatedCandidates}`,
      ],
      { cwd: process.cwd(), stdio: 'pipe' },
    )

    return readFileSync(outputPath, 'utf8')
  } finally {
    rmSync(cwd, { force: true, recursive: true })
  }
}
