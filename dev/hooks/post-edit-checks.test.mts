import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { editedPath, renderContext } from './post-edit-checks.mts'

const script = resolve(import.meta.dirname, 'post-edit-checks.mts')
const root = resolve(import.meta.dirname, '../..')

function run(input: string) {
  return spawnSync('node', [script], { cwd: root, input, encoding: 'utf8' })
}

describe('post-edit-checks payload handling', () => {
  it('reads the edited path from each harness dialect', () => {
    expect(editedPath({ tool_input: { file_path: 'a.ts' } })).toBe('a.ts')
    expect(editedPath({ toolInput: { filePath: 'b.ts' } })).toBe('b.ts')
    expect(editedPath({ toolInput: { path: 'c.ts' } })).toBe('c.ts')
    expect(editedPath({})).toBeUndefined()
  })

  it('renders warnings as PostToolUse additional context', () => {
    const out = JSON.parse(renderContext(['one', 'two'])) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string }
    }
    expect(out.hookSpecificOutput).toEqual({
      hookEventName: 'PostToolUse',
      additionalContext: 'one\ntwo',
    })
  })
})

describe('post-edit-checks process', () => {
  it('stays silent and exits 0 for a file no checker matches', () => {
    const result = run(JSON.stringify({ tool_input: { file_path: resolve(root, 'AGENTS.md') } }))
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
  })

  it('exits 0 on malformed or empty input', () => {
    expect(run('not json').status).toBe(0)
    expect(run('{}').status).toBe(0)
  })

  it('prints advisory JSON for a flagged edit', () => {
    const result = run(
      JSON.stringify({
        tool_input: { file_path: 'backend/services/__no_such_service__/package.json' },
      }),
    )
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('"additionalContext":"New backend service')
  })
})
