import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3'
import {
  startAwsEmulator,
  trustAwsEmulatorCertificate,
  type AwsEmulatorConnection,
  type RunningAwsEmulator,
} from './aws-emulator.mts'
import { testS3BucketNames } from './s3-test-environment.mts'

declare module 'vitest' {
  export interface ProvidedContext {
    awsEmulator: AwsEmulatorConnection
  }
}

// Every project in one Vitest process shares one emulator: each project runs this global setup,
// and a second emulator would only cost startup time and memory.
type SharedEmulator = { started: Promise<RunningAwsEmulator>; users: number }
const sharedKey = Symbol.for('voucha.test.awsEmulator')
const shared = globalThis as typeof globalThis & { [sharedKey]?: SharedEmulator }

export async function setup({
  provide,
}: {
  provide: (key: 'awsEmulator', value: AwsEmulatorConnection) => void
}): Promise<void> {
  shared[sharedKey] ??= { started: startAndProvision(), users: 0 }
  const entry = shared[sharedKey]
  entry.users += 1
  const { stop: _stop, ...connection } = await entry.started
  provide('awsEmulator', connection)
}

export async function teardown(): Promise<void> {
  const entry = shared[sharedKey]
  if (!entry) return
  entry.users -= 1
  if (entry.users > 0) return
  shared[sharedKey] = undefined
  await (await entry.started).stop()
}

async function startAndProvision(): Promise<RunningAwsEmulator> {
  const emulator = await startAwsEmulator()
  try {
    trustAwsEmulatorCertificate(emulator.caPem)
    const client = new S3Client({
      endpoint: emulator.endpoint,
      region: emulator.region,
      credentials: { accessKeyId: emulator.accessKeyId, secretAccessKey: emulator.secretAccessKey },
    })
    // The application reads fixed bucket names from the environment, so they exist before any
    // test runs. Tests isolate their objects with unique keys, never by sharing cleanup.
    try {
      await Promise.all(
        testS3BucketNames().map(Bucket => client.send(new CreateBucketCommand({ Bucket }))),
      )
    } finally {
      client.destroy()
    }
    return emulator
  } catch (err) {
    await emulator.stop()
    throw err
  }
}
