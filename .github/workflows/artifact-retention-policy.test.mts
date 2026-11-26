import { describe, expect, it } from 'vitest'
import {
  artifactNameFromBlock,
  artifactPolicyViolations,
  uploadArtifactBlocks,
} from '../../ci/workflow-artifact-policy.mts'

// Generated at runtime (not embedded as a literal) so this fixture ref does not trip
// no-test-git-sha / test-no-dependency-pins.
const SYNTHETIC_SHA = '0'.repeat(40)
const SYNTHETIC_UPLOAD_ARTIFACT_REF = `actions/upload-artifact@${SYNTHETIC_SHA}`
const SYNTHETIC_WRAPPER_ACTION_REF = `some-org/wrapper-action@${SYNTHETIC_SHA}`

const names = (source: string) => uploadArtifactBlocks(source).map(artifactNameFromBlock)

describe('Artifact classification policy', () => {
  it('accepts a classified upload', () => {
    const source = `steps:\n  - uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}\n    with:\n      name: web-test-report-shard-1\n`
    expect(artifactPolicyViolations([{ path: 'fixture.yml', source }])).toEqual([])
  })

  it('rejects an unclassified artifact name', () => {
    const source = `steps:\n  - uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}\n    with:\n      name: unknown-artifact\n`
    expect(artifactPolicyViolations([{ path: 'fixture.yml', source }])).toEqual([
      'fixture.yml: unclassified artifact name unknown-artifact',
    ])
  })

  it('fails closed when no upload exists', () => {
    expect(artifactPolicyViolations([{ path: 'fixture.yml', source: 'steps: []\n' }])).toEqual([
      'No upload-artifact steps found',
    ])
  })

  it('finds quoted, mixed-case, and merge upload-artifact references', () => {
    const source = `steps:
  - uses: '${SYNTHETIC_UPLOAD_ARTIFACT_REF}'
    with:
      name: quoted
  - uses: Actions/Upload-Artifact@${SYNTHETIC_SHA}
    with:
      name: mixed-case
  - uses: actions/upload-artifact/merge@${SYNTHETIC_SHA}
    with:
      name: merged
`
    expect(names(source)).toEqual(['quoted', 'mixed-case', 'merged'])
  })

  it('does not misclassify a `with.uses` decoy nested inside another step', () => {
    const source = `steps:
  - uses: ${SYNTHETIC_WRAPPER_ACTION_REF}
    with:
      uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}
      name: nested-decoy
`
    expect(uploadArtifactBlocks(source)).toHaveLength(0)
  })

  it('reads the artifact name from the parsed step, not decoy text in a multiline value', () => {
    const source = `steps:
  - name: upload
    env:
      DECOY: |
        uses: fake
        with:
          name: decoy-name
    uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}
    with:
      name: real-artifact
`
    expect(names(source)).toEqual(['real-artifact'])
  })

  it('normalizes a non-string scalar artifact name', () => {
    const source = `steps:\n  - uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}\n    with:\n      name: 123\n`
    expect(names(source)).toEqual(['123'])
  })

  it('replaces interpolations in the artifact name', () => {
    const source = `steps:\n  - uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}\n    with:\n      name: report-\${{ github.sha }}\n`
    expect(names(source)).toEqual(['report-INTERPOLATED'])
  })

  it('resolves alias-valued `uses` fields, both as a value and as the mapping key itself', () => {
    const source = `x-templates:
  key: &uses-key uses
steps:
  - uses: &upload-action ${SYNTHETIC_UPLOAD_ARTIFACT_REF}
    with:
      name: first-artifact
  - uses: *upload-action
    with:
      name: second-artifact
  - ? *uses-key
    : ${SYNTHETIC_UPLOAD_ARTIFACT_REF}
    with:
      name: x
`
    expect(names(source)).toEqual(['first-artifact', 'second-artifact', 'x'])
  })

  it('resolves alias-valued `with` mappings and aliased steps', () => {
    const source = `x-templates:
  upload: &upload
    uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}
    with: &upload-inputs
      name: aliased
steps:
  - *upload
  - uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}
    with: *upload-inputs
`
    expect(names(source)).toEqual(['aliased', 'aliased'])
  })

  it('resolves an aliased steps sequence', () => {
    const source = `x-templates:
  upload-steps: &upload-steps
    - uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}
      with:
        name: templated
steps: *upload-steps
`
    expect(names(source)).toEqual(['templated'])
  })

  it('trims and case-normalizes the `name` input the same way the Actions toolkit does', () => {
    const source = `steps:\n  - uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}\n    with:\n      Name: ' padded-artifact '\n`
    expect(names(source)).toEqual(['padded-artifact'])
  })

  it('throws on an upload without a name', () => {
    const [block] = uploadArtifactBlocks(
      `steps:\n  - uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}\n    with:\n      path: x\n`,
    )
    expect(() => artifactNameFromBlock(block!)).toThrow('No artifact name found')
  })
})
