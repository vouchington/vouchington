import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import { checkPublicSourceLiterals } from './public-source-literal-guard.mts'

const SENTRY_DSN = `https://${'a'.repeat(32)}@o${12345}.ingest.sentry.io/${67890}`
const REGIONAL_SENTRY_DSN = `https://${'b'.repeat(32)}@o${23456}.ingest.eu.sentry.io/${78901}`
const FUNCTION_URL = `https://${'a'.repeat(26)}.lambda-url.us-west-2.on.aws/`
const ACCOUNT_ARN = `arn:aws:s3:us-west-2:${111_222_333_444}:private-bucket`
const SERVICE_ACCOUNT = ['deployer', '@private-project.iam.gserviceaccount.com'].join('')
const CLOUD_SERVICES_ACCOUNT = [111_222, 333_444, '@cloudservices.gserviceaccount.com'].join('')
const CLOUD_BUILD_ACCOUNT = [111_222, 333_444, '@cloudbuild.gserviceaccount.com'].join('')
const ECR_REGISTRY = [111_222_333_444, '.dkr.ecr.us-west-2.amazonaws.com'].join('')
const SENTRY_ORG_LITERAL = ['"SENTRY_ORG": "', 'private-org"'].join('')
const SENTRY_PROJECT_LITERAL = ['Sentry project ', [12_345_678, 90_123_456].join('')].join('')
const SENTRY_ORG_PROSE_LITERAL = ['- organization: `', 'private-org`'].join('')

function runGuard(file: string, content: string): string[] {
  const root = mkdtempSync(join(tmpdir(), 'voucha-public-source-literal-guard-'))
  const destination = join(root, file)
  mkdirSync(join(destination, '..'), { recursive: true })
  writeFileSync(destination, content)
  const errors: string[] = []
  try {
    checkPublicSourceLiterals(root, [file], errors)
    return errors
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('public source literal guard', () => {
  it('flags production-shaped deployment literals with category, path, and line only', () => {
    const errors = runGuard(
      'docs/operations/runbook.md',
      [
        SENTRY_DSN,
        REGIONAL_SENTRY_DSN,
        FUNCTION_URL,
        ACCOUNT_ARN,
        SERVICE_ACCOUNT,
        CLOUD_SERVICES_ACCOUNT,
        CLOUD_BUILD_ACCOUNT,
        ECR_REGISTRY,
        SENTRY_ORG_LITERAL,
        SENTRY_PROJECT_LITERAL,
        SENTRY_ORG_PROSE_LITERAL,
        ['s3:/', '/private-bucket'].join(''),
        ['--profile', 'private-operator'].join(' '),
      ].join('\n'),
    )

    expect(errors).toHaveLength(13)
    expect(
      errors.every(error => error.startsWith('::error file=docs/operations/runbook.md,line=')),
    ).toBe(true)
    expect(errors.every(error => !error.includes(SENTRY_DSN))).toBe(true)
    expect(errors.join('\n')).toContain('sentry endpoint')
    expect(errors.join('\n')).toContain('lambda function URL')
    expect(errors.join('\n')).toContain('AWS account identifier')
    expect(errors.join('\n')).toContain('Google service-account identity')
    expect(errors.join('\n')).toContain('ECR registry')
    expect(errors.join('\n')).toContain('Sentry configuration identifier')
    expect(errors.join('\n')).toContain('Sentry project or organization identifier')
    expect(errors.join('\n')).toContain('Sentry organization prose identifier')
    expect(errors.join('\n')).toContain('S3 location')
    expect(errors.join('\n')).toContain('AWS CLI profile')
  })

  it('flags non-generic maintainer-local paths and identities', () => {
    const errors = runGuard(
      'docs/development/example.md',
      [
        ['/', 'Users/operator/project'].join(''),
        ['/', 'home/operator/project'].join(''),
        ['operator', '@workstation.local'].join(''),
      ].join('\n'),
    )

    expect(errors.join('\n')).toContain('maintainer-local path')
    expect(errors.join('\n')).toContain('local-host identity')
  })

  it('flags standalone AWS account identifiers while allowing injection and synthetic IDs', () => {
    const accountId = [111_222, 333_444].join('')
    expect(
      runGuard(
        'config.yml',
        [
          ['AWS_ACCOUNT_ID:', accountId].join(' '),
          ['aws_account_id="', accountId, '"'].join(''),
          ['awsAccountId:', accountId].join(' '),
          ['https://sqs.us-west-2.amazonaws.com/', accountId, '/private-queue'].join(''),
        ].join('\n'),
      ),
    ).toHaveLength(4)
    expect(
      runGuard(
        'config.yml',
        [
          'AWS_ACCOUNT_ID: ${AWS_ACCOUNT_ID}',
          'AWS_ACCOUNT_ID=<aws-account-id>',
          'AWS_ACCOUNT_ID: 123456789012',
          'https://sqs.us-west-2.amazonaws.com/123456789012/example-queue',
        ].join('\n'),
      ),
    ).toEqual([])
  })

  it('allows generic placeholders, public product domains, and synthetic development identities', () => {
    expect(
      runGuard(
        'docs/operations/runbook.md',
        [
          'https://voucha.ai',
          'https://<public-key>@o<org-id>.ingest.sentry.io/<project-id>',
          'arn:aws:s3:::<account-id>:placeholder',
          'deployer@example.iam.gserviceaccount.com',
          '123456789012@cloudservices.gserviceaccount.com',
          '123456789012@cloudbuild.gserviceaccount.com',
          '"SENTRY_ORG": "${SENTRY_ORG}"',
          '- organization: `SENTRY_ORG` from the environment',
          's3://bucket/path',
          '--profile <operator-profile>',
          '/Users/dev/project',
          'dev@myhost.local',
          '/Users/developer/project',
          '/home/developer/project',
          '/home/runner/project',
          'runner@myhost.local',
        ].join('\n'),
      ),
    ).toEqual([])
  })

  it('allows Sentry configuration expressions instead of mistaking them for literals', () => {
    expect(
      runGuard(
        'config.mts',
        [
          'SENTRY_ORG: process.env.SENTRY_ORG',
          'SENTRY_PROJECT = configuredProject',
          'SENTRY_ORG = settings.org',
          'SENTRY_PROJECT_ID = configuration.projectId',
          'SENTRY_PROJECT = process.env.SENTRY_PROJECT',
          'SENTRY_ORG=${SENTRY_ORG}',
        ].join('\n'),
      ),
    ).toEqual([])
  })

  it('flags Sentry configuration identifiers with whitespace before equals assignments', () => {
    expect(
      runGuard(
        'config.mts',
        [
          ['SENTRY_ORG', '=', '"private-org"'].join(' '),
          ['SENTRY_PROJECT', '=', 'private-project'].join('  '),
          ['SENTRY_PROJECT_ID', '= 123456'].join('\t'),
          ['SENTRY_ORG', '=', '"configuredOrg"'].join(' '),
        ].join('\n'),
      ),
    ).toHaveLength(4)
    expect(runGuard('.env.example', ['SENTRY_ORG=', 'privateorg'].join(''))).toHaveLength(1)
  })

  it('flags unquoted YAML Sentry identifiers while allowing injected values', () => {
    expect(
      runGuard(
        '.github/workflows/deploy.yml',
        [
          ['SENTRY_ORG:', 'private-org'].join(' '),
          ['SENTRY_PROJECT:', 'web-prod'].join(' '),
          ['SENTRY_PROJECT_ID:', '123456'].join(' '),
        ].join('\n'),
      ),
    ).toHaveLength(3)
    expect(
      runGuard(
        '.github/workflows/deploy.yml',
        [
          'SENTRY_ORG: ${{ vars.SENTRY_ORG }}',
          'SENTRY_PROJECT: <sentry-project>',
          'SENTRY_PROJECT_ID: "${SENTRY_PROJECT_ID}"',
        ].join('\n'),
      ),
    ).toEqual([])
  })

  it('does not treat a deployment-shaped S3 bucket with a placeholder prefix as generic', () => {
    expect(
      runGuard(
        'docs/operations/runbook.md',
        [
          ['s3:/', '/test-production-data/path'].join(''),
          ['s3:/', '/bucket-prod-private'].join(''),
        ].join('\n'),
      ),
    ).toHaveLength(2)
  })

  it('flags S3 bucket ARNs and virtual-hosted endpoints while allowing exact generic buckets', () => {
    expect(
      runGuard(
        'docs/operations/runbook.md',
        [
          ['arn:aws:s3:::', 'private-deployment-bucket'].join(''),
          ['https://private-deployment-bucket', '.s3.us-west-2.amazonaws.com/reports'].join(''),
          ['https://private.logs', '.s3.dualstack.us-west-2.amazonaws.com/reports'].join(''),
        ].join('\n'),
      ),
    ).toHaveLength(3)
    expect(
      runGuard(
        'docs/operations/runbook.md',
        [
          'arn:aws:s3:::bucket',
          'arn:aws:s3:::example-bucket',
          'https://test-bucket.s3.amazonaws.com/reports',
          'https://placeholder.s3.dualstack.us-west-2.amazonaws.com/reports',
        ].join('\n'),
      ),
    ).toEqual([])
  })

  it('inspects test and extensionless text paths but excludes vendor paths and binary files', () => {
    const errors = runGuard(
      'backend/example.test.mts',
      `${SENTRY_DSN}\n${['/', 'Users/operator'].join('')}`,
    )
    expect(errors).toHaveLength(2)
    expect(runGuard('Dockerfile', FUNCTION_URL)).toHaveLength(1)
    expect(runGuard('config/.env.example', FUNCTION_URL)).toHaveLength(1)
    expect(runGuard('asset.bin', `${FUNCTION_URL}\0binary`)).toEqual([])
    expect(
      runGuard(
        'vendor/example.md',
        `${FUNCTION_URL}\n${['operator', '@workstation.local'].join('')}`,
      ),
    ).toEqual([])
  })

  it('flags concrete AWS runbook arguments but allows placeholders and environment indirection', () => {
    const errors = runGuard(
      'docs/operations/runbook.md',
      [
        ['--region', 'us-west-2'],
        ['--region', '"us-east-1"'],
        ['--region=eu-west-1'],
        ['--endpoint-url', 'https://private.example'],
        ['--queue-url', 'https://queue.example'],
        ['--function-name', 'private-function'],
        ['--cluster', 'private-cluster'],
        ['--service', 'private-service'],
        ['--task-definition', 'private-task'],
        ['--log-group-name', 'private-log'],
        ['--alarm-names', 'private-alarm'],
        ['--table-name', 'private-table'],
        ['--parameter-name', 'private-parameter'],
        ['--secret-id', 'private-secret'],
        ['--bucket', 'private-bucket'],
      ]
        .map(parts => parts.join(' '))
        .concat([
          ['PROFILE', 'private-profile'].join('='),
          ['READ_PROFILE', 'private-read-profile'].join('='),
        ])
        .join('\n'),
    )

    expect(errors).toHaveLength(17)
    expect(
      runGuard(
        'docs/operations/runbook.md',
        [
          '--region <aws-region>',
          '--endpoint-url ${ENDPOINT_URL}',
          '--queue-url "$QUEUE_URL"',
          '--function-name <function-name>',
          '--cluster ${CLUSTER}',
          '--service <service-name>',
          '--task-definition "$TASK_DEFINITION"',
          '--log-group-name <log-group>',
          '--alarm-names ${ALARM_NAMES}',
          '--table-name <table-name>',
          '--parameter-name ${PARAMETER_NAME}',
          '--secret-id <secret-id>',
          '--bucket ${BUCKET}',
          'PROFILE=${OPERATOR_PROFILE}',
          'READ_PROFILE=<read-profile>',
        ].join('\n'),
      ),
    ).toEqual([])
  })
})
