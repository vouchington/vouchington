import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Action = {
  runs: {
    using: string
    steps: Array<{ shell?: string; env?: Record<string, string>; run?: string }>
  }
}

const action = load(
  readFileSync('.github/actions/comment-harness-session/action.yml', 'utf8'),
) as Action
const script = action.runs.steps[0]?.run ?? ''

describe('comment-harness-session action', () => {
  it('posts one eyes session link and skips a repeat', () => {
    expect(action.runs.using).toBe('composite')
    expect(action.runs.steps[0]?.shell).toBe('bash')
    expect(action.runs.steps[0]?.env).toMatchObject({
      GH_TOKEN: '${{ github.token }}',
      TARGET: '${{ inputs.target }}',
      SESSION_ID: '${{ inputs.session-id }}',
      SESSION_URL: '${{ inputs.session-url }}',
    })
    expect(script).toContain('👀 [View the Auto Harness session](${SESSION_URL}).')
    expect(script).toContain('<!-- auto-harness-session:${SESSION_ID} -->')
    expect(script).toContain('gh issue comment "$TARGET"')
    expect(script).toContain('Session comment already exists')
    expect(script).toContain('^sess-[0-9a-f]{8}$')
    expect(script).not.toContain('${{')
  })
})
