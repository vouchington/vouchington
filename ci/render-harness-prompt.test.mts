import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

const runRenderer = (args: string[]) => {
  return execFileAsync(process.execPath, ['ci/render-harness-prompt.mts', ...args], {
    cwd: process.cwd(),
  })
}

describe('render-harness-prompt', () => {
  it('renders automation templates with values and file-backed multiline content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'harness-prompt-'))
    try {
      const requestPath = join(dir, 'request.md')
      const outputPath = join(dir, 'prompt.md')
      const untrustedMarker = 'UNTRUSTED_REQUEST_LAST_MARKER'
      await writeFile(
        requestPath,
        `prefer a low-risk fix\nwith {{PLACEHOLDER_LIKE_TEXT}}\n${untrustedMarker}`,
      )

      await runRenderer([
        '--template',
        'docs/prompts/automation/plan.md',
        '--output',
        outputPath,
        '--var',
        'ISSUE_NUMBER=123',
        '--var',
        'ISSUE_URL=https://github.com/example/repo/issues/123',
        '--var',
        'ISSUE_TITLE=Broken widget',
        '--var',
        'TRIGGER_COMMENT_ID=456',
        '--var-file',
        `REQUEST_BODY=${requestPath}`,
      ])

      const rendered = await readFile(outputPath, 'utf8')
      expect(rendered).toContain('Plan a fix for issue #123')
      expect(rendered).toContain('Issue title: Broken widget')
      expect(rendered).toContain('prefer a low-risk fix\nwith {{PLACEHOLDER_LIKE_TEXT}}')
      expect(rendered).not.toContain('{{ISSUE_NUMBER}}')
      expect(rendered).toMatch(/^## Auto Harness session\n/)
      expect(rendered).toContain('Do not create a second worktree')
      expect(rendered).toContain('Do not run `./dev/reset-worktree`')
      expect(rendered).toContain('Repository dependencies are not preinstalled')
      expect(rendered).toContain('initialize only the tooling your task needs')
      expect(rendered).toContain('discard or detach the session state')
      expect(rendered).toContain('ordinary implementation, validation, commit, push')
      expect(rendered.replace(/\s+/gu, ' ')).toContain(
        'Do not edit files, create a branch, commit, push, or open a PR.',
      )
      expect(rendered).toContain('Never run `gh pr merge` in any form')
      expect(rendered).toContain('never run `gh stack merge`')
      expect(rendered).not.toContain('codex-completion.json')
      expect(rendered).not.toContain('trusted publisher')
      expect(rendered).toContain('never arm auto-merge (`gh pr merge --auto`)')
      expect(rendered.match(/never arm auto-merge/gi)).toHaveLength(1)
      expect(rendered.indexOf(untrustedMarker)).toBeLessThan(
        rendered.indexOf('## CI merge authority'),
      )
      expect(rendered.match(/^## CI merge authority$/gm)).toHaveLength(1)
      expect(rendered.trimEnd()).toMatch(
        /## CI merge authority[\s\S]*See `docs\/development\/merge-authority\.md`\.$/,
      )
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })

  it('renders the scheduled prompt automation template with relative markdown links intact', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'harness-scheduled-prompt-'))
    const outputPath = join(dir, 'prompt.md')
    try {
      await runRenderer([
        '--template',
        'docs/prompts/automation/scheduled-prompt.md',
        '--output',
        outputPath,
        '--var',
        'PROMPT_PATH=docs/prompts/scheduled/test-pruning.md',
        '--var',
        'PROMPT_NAME=test-pruning.md',
        '--var',
        'RUN_URL=https://github.com/vouchington/vouchington/actions/runs/123',
        '--var-file',
        'PROMPT_BODY=docs/prompts/scheduled/test-pruning.md',
      ])

      const rendered = await readFile(outputPath, 'utf8')
      expect(rendered).toContain('Prompt file: `docs/prompts/scheduled/test-pruning.md`')
      expect(rendered).toContain('--- BEGIN SCHEDULED PROMPT ---')
      expect(rendered).toContain('[vitest.md](vitest.md)')
      expect(rendered).toContain('[playwright.md](playwright.md)')
      expect(rendered).not.toContain('{{PROMPT_BODY}}')
      expect(rendered.indexOf('--- END SCHEDULED PROMPT ---')).toBeLessThan(
        rendered.indexOf('## CI merge authority'),
      )
      expect(rendered.match(/^## CI merge authority$/gm)).toHaveLength(1)
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })

  it('rejects templates outside docs/prompts/automation', async () => {
    await expect(
      runRenderer(['--template', 'docs/prompts/scheduled/vitest.md']),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('docs/prompts/automation'),
    })
  })

  it('fails when a placeholder is unresolved', async () => {
    await expect(
      runRenderer(['--template', 'docs/prompts/automation/plan.md']),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('Unresolved placeholder'),
    })
  })

  it('reports inaccessible var-file inputs without a stack trace', async () => {
    await expect(
      runRenderer([
        '--template',
        'docs/prompts/automation/plan.md',
        '--var-file',
        'REQUEST_BODY=/tmp/harness-missing-prompt-input.md',
      ]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('Failed to read file for REQUEST_BODY'),
    })
  })
})
