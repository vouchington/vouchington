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
    expect(action.runs?.steps).toEqual([
      { uses: './.github/actions/setup-node-pnpm' },
      {
        name: 'Build email-templates',
        shell: 'bash',
        'working-directory': 'email-templates',
        run: 'pnpm run build',
      },
    ])
  })
})
