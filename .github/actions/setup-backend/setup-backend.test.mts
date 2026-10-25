import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

const action = load(readFileSync('.github/actions/setup-backend/action.yml', 'utf8')) as {
  inputs?: Record<string, unknown>
  runs?: {
    steps?: Array<{ name?: string; run?: string; uses?: string; 'working-directory'?: string }>
  }
}

describe('setup-backend composite action', () => {
  it('exposes no inputs', () => {
    expect(action.inputs).toBeUndefined()
  })

  it('installs the workspace through setup-node-pnpm, then builds email templates', () => {
    const [setup, ...rest] = action.runs?.steps ?? []
    expect(setup?.uses).toMatch(
      /^vouchington\/vouchington-tooling\/\.github\/actions\/setup-node-pnpm@[0-9a-f]{40}$/,
    )
    expect(rest).toEqual([
      {
        name: 'Build email-templates',
        shell: 'bash',
        'working-directory': 'email-templates',
        run: 'pnpm run build',
      },
    ])
  })
})
