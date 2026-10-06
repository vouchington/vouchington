import type { S3Client } from '@aws-sdk/client-s3'

/**
 * Makes every client of `clientClass` fail the way S3 answers fake credentials, without a socket.
 *
 * Database-backed projects run with fake static credentials and no endpoint override, so any S3
 * call they make can only return 403 from AWS or hang: the AWS SDK's Node handler has no connect
 * or request timeout. A test that needs a different answer spies on `S3Client.prototype.send`,
 * which wraps this default; `vi.restoreAllMocks()` then returns to it rather than to real egress,
 * which is why this assigns the method instead of spying.
 */
export function installOfflineS3Send(clientClass: typeof S3Client): void {
  clientClass.prototype.send = offlineS3Send as never
}

class OfflineS3Error extends Error {
  override name = 'InvalidAccessKeyId'
  readonly $fault = 'client'
  readonly $metadata = { httpStatusCode: 403 }
}

function offlineS3Send(command: { constructor: { name: string } }): Promise<never> {
  return Promise.reject(
    new OfflineS3Error(
      `${command.constructor.name} was not sent: database-backed tests never reach AWS; spy on S3Client.prototype.send for the answer this test needs`,
    ),
  )
}
