import { describe, expect, it } from 'vitest'
import { withPackRuleDir } from '../ast-grep-pack-config.mts'

describe('ast-grep rule directories', () => {
  it('prepends the pack directory without duplicating it', () => {
    const packRules = '/fixture/shared-pack/rules'
    expect(withPackRuleDir({ ruleDirs: ['ast-grep-rules'] }, packRules).ruleDirs).toEqual([
      packRules,
      'ast-grep-rules',
    ])
    expect(
      withPackRuleDir({ ruleDirs: [packRules, 'ast-grep-rules'] }, packRules).ruleDirs,
    ).toEqual([packRules, 'ast-grep-rules'])
  })
})
