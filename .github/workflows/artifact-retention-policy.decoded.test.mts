import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { uploadArtifactBlocks } from '../test-helpers/artifact-retention-policy.fixtures.mts'

describe('decoded artifact policy data', () => {
  it('checks each use of a shared sequence even when its anchor is outside steps', () => {
    const blocks = uploadArtifactBlocks(`
shared: &uploads
  - uses: actions/upload-artifact@fixture
    with:
      retention-days: 1
      name: repeated
jobs:
  first:
    steps: *uploads
  second:
    steps: *uploads
`)
    expect(blocks.map(block => block.artifactName)).toEqual(['repeated', 'repeated'])
  })

  it('terminates cyclic decoded aliases without skipping unrelated workflow steps', () => {
    const blocks = uploadArtifactBlocks(`
shared: &recursive
  nested: *recursive
jobs:
  check:
    steps:
      - uses: actions/upload-artifact@fixture
        with:
          name: after-cycle
          retention-days: 1
`)
    expect(blocks.map(block => block.artifactName)).toEqual(['after-cycle'])
  })

  it('renders resolved aliased inputs in the offending step diagnostic', () => {
    const [block] = uploadArtifactBlocks(`
inputs: &inputs
  name: evidence
  retention-days: 3
jobs:
  check:
    steps:
      - uses: actions/upload-artifact@fixture
        with: *inputs
`)
    expect(block?.retentionValue).toBe(3)
    expect(parse(block!.stepSource)).toMatchObject({
      uses: 'actions/upload-artifact@fixture',
      with: { name: 'evidence', 'retention-days': 3 },
    })
  })
})
