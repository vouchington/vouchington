import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import { checkPublicSourceLiterals } from './public-source-literal-guard.mts'

const SELF_HOSTED_SENTRY_DSN = ['https://private_key@', 'errors.internal.example/123'].join('')
const IPV6_SELF_HOSTED_SENTRY_DSN = ['https://private_key@[', '2001:db8::1]/123'].join('')
const COMPUTE_DEFAULT_SERVICE_ACCOUNT = [
  [123_456, 789_013].join(''),
  '-compute@developer.gserviceaccount.com',
].join('')
const APP_ENGINE_DEFAULT_SERVICE_ACCOUNT = ['private-project', '@appspot.gserviceaccount.com'].join(
  '',
)
const PRIVATE_INFRA_BLOB_LINK = [
  'https://github.com/vouchington/vouchington-infra/',
  'blob/main/opentofu/runbook.md',
].join('')
const PRIVATE_INFRA_TREE_LINK = [
  'https://github.com/vouchington/vouchington-infra/',
  'tree/main/opentofu',
].join('')

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

describe('public source literal guard additional deployment forms', () => {
  it('flags concrete self-hosted Sentry DSN assignments while allowing injected expressions', () => {
    expect(
      runGuard(
        'config.mts',
        [
          ['SENTRY_DSN = "', SELF_HOSTED_SENTRY_DSN, '"'].join(''),
          ['SENTRY_WEB_DSN:', SELF_HOSTED_SENTRY_DSN].join(' '),
          ['SENTRY_TUNNEL_PREVIOUS_WEB_DSN:', SELF_HOSTED_SENTRY_DSN].join(' '),
          ['SENTRY_DSN:', IPV6_SELF_HOSTED_SENTRY_DSN].join(' '),
        ].join('\n'),
      ),
    ).toHaveLength(4)
    expect(
      runGuard(
        'config.mts',
        [
          'SENTRY_DSN=${SENTRY_DSN}',
          'SENTRY_WEB_DSN = process.env.SENTRY_WEB_DSN',
          'SENTRY_TUNNEL_PREVIOUS_WEB_DSN = process.env.SENTRY_TUNNEL_PREVIOUS_WEB_DSN',
          'SENTRY_DSN: "https://public@example.test/123"',
        ].join('\n'),
      ),
    ).toEqual([])
  })

  it('flags path-style S3 endpoints while allowing injected and generic buckets', () => {
    expect(
      runGuard(
        'docs/operations/runbook.md',
        [
          ['https://s3.us-west-2.amazonaws.com/', 'private-deployment-bucket/reports'].join(''),
          ['https://s3.dualstack.us-west-2.amazonaws.com/', 'private-logs/reports'].join(''),
        ].join('\n'),
      ),
    ).toHaveLength(2)
    expect(
      runGuard(
        'docs/operations/runbook.md',
        [
          'https://s3.amazonaws.com/bucket/reports',
          'https://s3.us-west-2.amazonaws.com/${S3_BUCKET}/reports',
        ].join('\n'),
      ),
    ).toEqual([])
  })

  it('flags default Compute Engine and App Engine service accounts with exact synthetic exemptions', () => {
    expect(
      runGuard(
        'config.yml',
        [COMPUTE_DEFAULT_SERVICE_ACCOUNT, APP_ENGINE_DEFAULT_SERVICE_ACCOUNT].join('\n'),
      ),
    ).toHaveLength(2)
    expect(
      runGuard(
        'config.yml',
        [
          '123456789012-compute@developer.gserviceaccount.com',
          'example@appspot.gserviceaccount.com',
        ].join('\n'),
      ),
    ).toEqual([])
  })

  it('allows bare 12-digit account fields without AWS event context', () => {
    const privateAccount = [111_222, 333_444].join('')
    expect(
      runGuard(
        'event.json',
        [
          ['"account": "', privateAccount, '"'].join(''),
          ['account:', privateAccount].join(' '),
        ].join('\n'),
      ),
    ).toEqual([])
    expect(
      runGuard(
        'billing.ts',
        [
          ['account:', privateAccount].join(' '),
          'post-detail-type-badge-review',
          'eventSource: analytics',
        ].join('\n'),
      ),
    ).toEqual([])
  })

  it('flags 12-digit account fields only with AWS event discriminators', () => {
    const privateAccount = [111_222, 333_444].join('')
    expect(
      runGuard(
        'event.json',
        [
          "'detail-type': 'Scheduled Event'",
          "source: 'aws.partner/stripe.com'",
          ['account:', privateAccount].join(' '),
        ].join('\n'),
      ),
    ).toHaveLength(1)
    expect(
      runGuard(
        'sns.json',
        [
          ['TopicArn:', 'arn:aws:sns:us-west-2:placeholder:topic'].join(' '),
          ['account:', privateAccount].join(' '),
        ].join('\n'),
      ),
    ).toHaveLength(1)
    expect(
      runGuard(
        'lambda.json',
        ['eventSource: aws:sns', ['account:', privateAccount].join(' ')].join('\n'),
      ),
    ).toHaveLength(1)
    expect(
      runGuard(
        'event.json',
        [['{"source": "aws.ec2", "account": "', privateAccount, '"}'].join('')].join('\n'),
      ),
    ).toHaveLength(1)
    expect(
      runGuard(
        'event.json',
        [
          "'detail-type': 'Scheduled Event'",
          "source: 'aws.partner/stripe.com'",
          'account: 123456789012',
          'account: ${AWS_ACCOUNT_ID}',
          'account: <aws-account-id>',
        ].join('\n'),
      ),
    ).toEqual([])
  })

  it('allows Linux application routes and generic service homes while flagging maintainer paths', () => {
    expect(
      runGuard(
        'web/app/page.tsx',
        [
          ['href: "/', 'home/settings"'].join(''),
          ['path: "/', 'home/settings/profile"'].join(''),
          ['HOME=/', 'home/node'].join(''),
          ['cwd: "/', 'home/node/app"'].join(''),
          ['HOME=/', 'home/ubuntu'].join(''),
          ['statfs:/', 'home/debian'].join(''),
          ['file:/', 'home/www-data/.cache'].join(''),
          ['root=/', 'home/nobody'].join(''),
          ['brew=/', 'home/linuxbrew'].join(''),
          ['user=/', 'home/ec2-user'].join(''),
          'from "@/components/home/settings"',
        ].join('\n'),
      ),
    ).toEqual([])
    const errors = runGuard(
      'docs/development/example.md',
      [
        ['/', 'home/operator'].join(''),
        ['/', 'home/operator/project'].join(''),
        ['/', 'home/jong/actions-runner'].join(''),
        ['/', 'home/node-operator/src'].join(''),
        ['/', 'Users/operator'].join(''),
        ['/', 'Users/node/project'].join(''),
      ].join('\n'),
    )
    expect(errors.filter(error => error.includes('maintainer-local path'))).toHaveLength(6)
  })

  it('flags deep links into the private vouchington-infra repository', () => {
    const errors = runGuard(
      'docs/operations/runbook.md',
      [PRIVATE_INFRA_BLOB_LINK, PRIVATE_INFRA_TREE_LINK].join('\n'),
    )
    expect(errors).toHaveLength(2)
    expect(errors.join('\n')).toContain('private infrastructure repository link')
  })

  it('allows references to the private vouchington-infra repository without a deep link', () => {
    expect(
      runGuard(
        'docs/operations/runbook.md',
        [
          'https://github.com/vouchington/vouchington-infra',
          'the private `vouchington-infra` repository',
          'https://github.com/vouchington/vouchington-infra/issues/47',
        ].join('\n'),
      ),
    ).toEqual([])
  })
})
