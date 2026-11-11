import { createRequire } from 'node:module'
import { inject, vi } from 'vitest'
import { trustAwsEmulatorCertificate } from './aws-emulator.mts'

// Every AWS SDK client in a test talks to the AWS Emulator started by
// `vitest.setup.aws-emulator-server.mts`: requests, signatures, presigned URLs and stored state are
// real. Credentialed projects that call real AWS do not load this file.
const emulator = inject('awsEmulator')
if (!emulator) {
  throw new Error(
    'AWS Emulator connection missing: add ./backend/test-helpers/vitest.setup.aws-emulator-server.mts to this project globalSetup',
  )
}

trustAwsEmulatorCertificate(emulator.caPem)
process.env.AWS_ENDPOINT_URL = emulator.endpoint
// The default credential chain would otherwise dial the EC2 metadata service.
process.env.AWS_EC2_METADATA_DISABLED = 'true'
// Each client reads its own credential tuple before the shared one. Every tuple names the
// emulator's keys, so a real key in the environment can never be paired with the emulator.
for (const prefix of ['', 'S3_', 'SES_', 'SQS_', 'BEDROCK_', 'FIREHOSE_']) {
  process.env[`${prefix}AWS_ACCESS_KEY_ID`] = emulator.accessKeyId
  process.env[`${prefix}AWS_SECRET_ACCESS_KEY`] = emulator.secretAccessKey
  process.env[`${prefix}AWS_SESSION_TOKEN`] = ''
}

// The SDK rejects dual-stack endpoints combined with a custom endpoint. Production clients opt
// into dual-stack through these shared constants; tests address the emulator's single endpoint.
// The package resolves only from its owning workspace, so the override names that exact file.
const awsPackage = createRequire(new URL('../modules/aws/package.json', import.meta.url))
vi.doMock(awsPackage.resolve('@vouchington/aws/request-handler'), async importOriginal => ({
  ...(await importOriginal<object>()),
  AWS_DUALSTACK_CLIENT_CONFIG: { useDualstackEndpoint: false },
}))
// Service presets spread the dual-stack constant internally, so each one is overridden too.
for (const [subpath, presetName] of [
  ['sqs', 'SQS_CLIENT_CONFIG'],
  ['ses', 'SES_CLIENT_CONFIG'],
] as const) {
  vi.doMock(awsPackage.resolve(`@vouchington/aws/${subpath}`), async importOriginal => {
    const actual = await importOriginal<Record<string, object>>()
    return { ...actual, [presetName]: { ...actual[presetName], useDualstackEndpoint: false } }
  })
}
