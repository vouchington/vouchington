import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Workflow = {
  jobs?: Record<
    string,
    {
      steps?: Array<{
        id?: string
        run?: string
      }>
    }
  >
}

const workflow = load(readFileSync('.github/workflows/scheduled-prompts.yml', 'utf8')) as Workflow

describe('scheduled-prompts workflow', () => {
  it('runs prompt selection through system bash without Bash 4 helpers', () => {
    const selectStep = workflow.jobs?.['select-prompt']?.steps?.find(step => step.id === 'select')
    expect(selectStep?.run).toBeTruthy()

    const cwd = mkdtempSync(join(tmpdir(), 'scheduled-prompts-'))
    const outputFile = join(cwd, 'github-output.txt')
    const promptDir = join(cwd, 'docs', 'prompts', 'scheduled')
    const binDir = join(cwd, 'bin')

    try {
      mkdirSync(promptDir, { recursive: true })
      mkdirSync(binDir)
      mkdirSync(join(promptDir, '00-directory.md'))
      writeFileSync(join(promptDir, '01-alpha.md'), 'alpha prompt\n')
      writeFileSync(join(promptDir, '02-beta.md'), 'beta prompt\n')

      execFileSync('/bin/bash', ['-c', selectStep?.run ?? ''], {
        cwd,
        env: {
          ...process.env,
          GITHUB_OUTPUT: outputFile,
          PATH: `${binDir}:${process.env.PATH ?? ''}`,
          REQUESTED_PROMPT: '',
          RUN_NUMBER: '2',
        },
      })

      expect(readFileSync(outputFile, 'utf8')).toBe(
        [
          'prompt_path=docs/prompts/scheduled/02-beta.md',
          'prompt_name=02-beta.md',
          'completion_mode=pr',
          'existing_issue_maintenance=false',
          '',
        ].join('\n'),
      )
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
