import { describe, expect, it } from 'vitest'
import type { SharedContext } from 'vouchington-tooling/shared-context'

import { checkPublicSourceLiterals } from './public-source-literals.mts'

function run(content: string): Promise<{ errors: string[] }> {
  return checkPublicSourceLiterals({
    repoRoot: '/unused',
    isInsideGitRepo: true,
    trackedFiles: ['docs/a.md'],
    readTrackedFile: () => content,
  } as unknown as SharedContext)
}

describe('Voucha public source literal policy', () => {
  it('flags deep links into the private infrastructure repository only', async () => {
    const flagged = await run('https://github.com/vouchington/vouchington-infra/blob/main/x')
    expect(flagged.errors.join('\n')).toContain('private infrastructure repository link')
    const bare = await run('https://github.com/vouchington/vouchington-infra/issues/47')
    expect(bare.errors).toEqual([])
  })

  it('flags literal profile assignments in docs', async () => {
    const flagged = await run(['PROFILE', 'private-profile'].join('='))
    expect(flagged.errors.join('\n')).toContain('AWS profile name')
  })

  it('allows the developer image upload placeholder bucket', async () => {
    const result = await run(['s3:/', '/developer-image-uploads'].join(''))
    expect(result.errors).toEqual([])
  })
})
