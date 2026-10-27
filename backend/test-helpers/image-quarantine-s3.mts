import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3'
import { onTestFinished, vi } from 'vitest'

type Image = { id: string; s3_key: string }
type Command = CopyObjectCommand | DeleteObjectCommand | DeleteObjectsCommand | ListObjectsV2Command

/** Own only the selected image's external SDK requests; unrelated requests keep their prior behavior. */
export function observeImageQuarantineS3(image: Image) {
  const imagesBucket = process.env.S3_BUCKET_IMAGES?.trim()
  const quarantineBucket = process.env.S3_BUCKET_QUARANTINE?.trim()
  if (!imagesBucket || !quarantineBucket)
    throw new Error('Image quarantine fixture requires S3_BUCKET_IMAGES and S3_BUCKET_QUARANTINE')
  const keys = new Set([image.id, image.s3_key])
  const calls: Command[] = []
  let copyFailure: Error | undefined
  let renderFailure: Error | undefined
  const prior = S3Client.prototype.send
  const spy = vi.spyOn(S3Client.prototype, 'send').mockImplementation(function (
    this: S3Client,
    command,
    ...args
  ) {
    const owned =
      (command instanceof CopyObjectCommand || command instanceof DeleteObjectCommand) &&
      keys.has(command.input.Key ?? '')
    const ownedRenders =
      command instanceof ListObjectsV2Command &&
      [...keys].some(key => command.input.Prefix === `${key}--`)
    const ownedRenderDelete =
      command instanceof DeleteObjectsCommand &&
      !!command.input.Delete?.Objects?.length &&
      command.input.Delete.Objects.every(object =>
        [...keys].some(key => object.Key === `${key}--owned-render`),
      )
    if (!owned && !ownedRenders && !ownedRenderDelete)
      return Reflect.apply(prior, this, [command, ...args])
    calls.push(command as Command)
    if (command instanceof CopyObjectCommand && copyFailure) {
      const error = copyFailure
      copyFailure = undefined
      return Promise.reject(error)
    }
    if (command instanceof ListObjectsV2Command && renderFailure) {
      const error = renderFailure
      renderFailure = undefined
      return Promise.reject(error)
    }
    return Promise.resolve({
      $metadata: {},
      ...(command instanceof ListObjectsV2Command
        ? { Contents: [{ Key: `${command.input.Prefix}owned-render` }] }
        : {}),
    })
  })
  onTestFinished(() => spy.mockRestore())
  return {
    quarantineBucket,
    imagesBucket,
    calls,
    failCopy(error: Error) {
      copyFailure = error
    },
    failRenders(error: Error) {
      renderFailure = error
    },
    copies: () => calls.filter(command => command instanceof CopyObjectCommand),
    deletes: () => calls.filter(command => command instanceof DeleteObjectCommand),
    renderLists: () => calls.filter(command => command instanceof ListObjectsV2Command),
  }
}
