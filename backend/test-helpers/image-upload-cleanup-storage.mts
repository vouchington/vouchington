import { DeleteObjectCommand, S3Client, type DeleteObjectCommandInput } from '@aws-sdk/client-s3'
import { vi } from 'vitest'

/** Provider-only interception. Every attempted foreign key remains visible and rejects. */
export function installOwnedUploadCleanupStorage(
  ownedKeys: readonly string[],
  beforeDelete?: (input: DeleteObjectCommandInput) => Promise<void>,
) {
  const calls: DeleteObjectCommandInput[] = []
  const send = vi.spyOn(S3Client.prototype, 'send').mockImplementation(async (command: unknown) => {
    if (!(command instanceof DeleteObjectCommand))
      throw new Error('Unexpected upload cleanup S3 operation')
    calls.push(command.input)
    if (!command.input.Key || !ownedKeys.includes(command.input.Key))
      throw new Error('Refusing foreign upload cleanup storage key')
    await beforeDelete?.(command.input)
    return { $metadata: {} }
  })
  return { calls, restore: () => send.mockRestore() }
}
