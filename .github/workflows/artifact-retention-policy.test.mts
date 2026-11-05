import { describe, expect, it } from 'vitest'
import {
  artifactNameFromBlock,
  artifactPolicyViolations,
  invalidRetentionBlocks,
  uploadArtifactBlocks,
} from '../../ci/workflow-artifact-policy.mts'

// Generated at runtime (not embedded as a literal) so this fixture ref does not trip
// no-test-git-sha / test-no-dependency-pins.
const SYNTHETIC_SHA = '0'.repeat(40)
const SYNTHETIC_UPLOAD_ARTIFACT_REF = `actions/upload-artifact@${SYNTHETIC_SHA}`
const SYNTHETIC_WRAPPER_ACTION_REF = `some-org/wrapper-action@${SYNTHETIC_SHA}`

describe('Artifact retention policy', () => {
  it('accepts a classified one-day overwrite upload', () => {
    const source = `steps:\n  - uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}\n    with:\n      name: web-test-report-shard-1\n      overwrite: true\n      retention-days: 1\n`
    expect(artifactPolicyViolations([{ path: 'fixture.yml', source }])).toEqual([])
  })

  it('rejects invalid retention from an owned source', () => {
    expect(
      artifactPolicyViolations([
        {
          path: 'fixture.yml',
          source: `steps:\n  - uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}\n    with:\n      name: web-test-report-shard-1\n      overwrite: true\n      retention-days: 2\n`,
        },
      ]).map(violation => violation.split('\n')[0]),
    ).toEqual(['fixture.yml: invalid retention-days value 2'])
  })

  it.each([
    ['omitted retention', '', 'test-artifact'],
    ['expression retention', '      retention-days: ${{ inputs.retention_days }}', 'test-artifact'],
    ['nonnumeric retention', '      retention-days: one', 'test-artifact'],
    ['extended retention', '      retention-days: 2', 'test-artifact'],
    [
      'extended interpolated-name retention',
      '      retention-days: 3',
      'test-artifact-${{ github.sha }}',
    ],
  ])('rejects an upload-artifact step with %s', (_, retentionLine, artifactName) => {
    const source = `steps:
  - uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}
    with:
      name: ${artifactName}
${retentionLine}
      path: test-output
`

    expect(invalidRetentionBlocks(source)).toHaveLength(1)
  })

  it.each([
    ['bare', '1', 'test-artifact'],
    ['single-quoted', "'1'", 'test-artifact'],
    ['double-quoted', '"1"', 'test-artifact'],
    ['interpolated name', '1', 'test-artifact-${{ github.sha }}'],
  ])('accepts %s literal retention', (_, retentionValue, artifactName) => {
    const source = `steps:
  - uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}
    with:
      name: ${artifactName}
      retention-days: ${retentionValue}
      path: test-output
`

    expect(invalidRetentionBlocks(source)).toHaveLength(0)
  })

  it('scopes literal retention to the upload action inputs', () => {
    const source = `steps:
  - uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}
    env:
      retention-days: 1
    with:
      name: test-artifact
      retention-days: \${{ inputs.retention_days }}
      path: test-output
`

    expect(invalidRetentionBlocks(source)).toHaveLength(1)
  })

  it('finds quoted upload-artifact action references', () => {
    const source = `steps:
  - uses: '${SYNTHETIC_UPLOAD_ARTIFACT_REF}'
    with:
      name: test-artifact
      path: test-output
`

    expect(invalidRetentionBlocks(source)).toHaveLength(1)
  })

  it('does not accept a decoy literal inside another multiline input', () => {
    const source = `steps:
  - uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}
    with:
      name: test-artifact
      retention-days: \${{ inputs.retention_days }}
      path: |
        test-output
        retention-days: 1
`

    expect(invalidRetentionBlocks(source)).toHaveLength(1)
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

  it('reads the artifact name from the AST, not decoy text in an earlier multiline value', () => {
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
      retention-days: 1
`

    const [block] = uploadArtifactBlocks(source)
    expect(block).toBeDefined()
    expect(artifactNameFromBlock(block!)).toBe('real-artifact')
  })

  it('normalizes a non-string scalar artifact name the same way retentionValue is normalized', () => {
    const source = `steps:
  - uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}
    with:
      name: 123
      retention-days: 1
`

    const [block] = uploadArtifactBlocks(source)
    expect(block).toBeDefined()
    expect(artifactNameFromBlock(block!)).toBe('123')
  })

  it('matches an upload-artifact reference regardless of owner/repository letter case', () => {
    const source = `steps:
  - uses: Actions/Upload-Artifact@${SYNTHETIC_SHA}
    with:
      name: test-artifact
      retention-days: 1
`

    expect(uploadArtifactBlocks(source)).toHaveLength(1)
  })

  it('recognizes the upload-artifact merge sub-action as a producer that does not require `overwrite`', () => {
    const source = `steps:
  - uses: actions/upload-artifact/merge@${SYNTHETIC_SHA}
    with:
      name: merged-artifact
      retention-days: 1
`

    const [block] = uploadArtifactBlocks(source)
    expect(block).toBeDefined()
    expect(block!.requiresOverwrite).toBe(false)
    expect(artifactNameFromBlock(block!)).toBe('merged-artifact')
    expect(invalidRetentionBlocks(source)).toHaveLength(0)
  })

  it('resolves alias-valued `uses` fields, both as a value and as the mapping key itself', () => {
    const source = `x-templates:
  key: &uses-key uses
steps:
  - uses: &upload-action ${SYNTHETIC_UPLOAD_ARTIFACT_REF}
    with:
      name: first-artifact
      retention-days: 1
  - uses: *upload-action
    with:
      name: second-artifact
      retention-days: 1
  - ? *uses-key
    : ${SYNTHETIC_UPLOAD_ARTIFACT_REF}
    with:
      name: x
      retention-days: 1
`

    const blocks = uploadArtifactBlocks(source)
    expect(blocks).toHaveLength(3)
    expect(blocks.map(artifactNameFromBlock)).toEqual(['first-artifact', 'second-artifact', 'x'])
  })

  it('resolves alias-valued `with` mappings and scalar inputs pointing at anchored data', () => {
    const source = `steps:
  - uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}
    with: &upload-inputs
      name: first-artifact
      retention-days: &one 1
      overwrite: true
  - uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}
    with: *upload-inputs
  - uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}
    with:
      name: third-artifact
      retention-days: *one
`

    expect(invalidRetentionBlocks(source)).toHaveLength(0)
    const blocks = uploadArtifactBlocks(source)
    expect(blocks).toHaveLength(3)
    blocks.slice(0, 2).forEach(block => expect(String(block.overwriteValue)).toBe('true'))
  })

  it('resolves aliased steps, both a single sequence element and the entire steps sequence', () => {
    const singleSource = `x-templates:
  upload: &upload
    uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}
    with:
      name: aliased
      retention-days: 1
steps:
  - *upload
`
    const sequenceSource = `x-templates:
  upload-steps: &upload-steps
    - uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}
      with:
        name: templated
        retention-days: 1
steps: *upload-steps
`

    expect(artifactNameFromBlock(uploadArtifactBlocks(singleSource)[0]!)).toBe('aliased')
    expect(artifactNameFromBlock(uploadArtifactBlocks(sequenceSource)[0]!)).toBe('templated')
  })

  it('trims and case-normalizes scalar `with:` inputs the same way the Actions toolkit does', () => {
    const source = `steps:
  - uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}
    with:
      Name: ' padded-artifact '
      Retention-Days: ' 1 '
      Overwrite: ' true '
`

    const [block] = uploadArtifactBlocks(source)
    expect(block).toBeDefined()
    expect(artifactNameFromBlock(block!)).toBe('padded-artifact')
    expect(String(block!.overwriteValue)).toBe('true')
    expect(invalidRetentionBlocks(source)).toHaveLength(0)
  })

  it('requires overwrite and an explicit cleanup classification', () => {
    const source = `steps:\n  - uses: ${SYNTHETIC_UPLOAD_ARTIFACT_REF}\n    with:\n      name: unknown-artifact\n      retention-days: 1\n`
    expect(
      artifactPolicyViolations([{ path: 'fixture.yml', source }]).map(
        violation => violation.split('\n')[0],
      ),
    ).toEqual([
      'fixture.yml: actions/upload-artifact step without overwrite: true',
      'fixture.yml: unclassified artifact name unknown-artifact',
    ])
  })
})
