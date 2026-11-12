import { randomUUID } from 'node:crypto'
import { onTestFinished } from 'vitest'
import { S3ImagesClient } from '../modules/aws/s3.mts'

type HandlerArguments = { input: object }
type Handler = (args: HandlerArguments) => Promise<{ output: object; response: unknown }>
type Middleware = (next: Handler, context: { commandName?: string }) => Handler

// The AWS Emulator answers every request for real. These seams change one field of a real request
// or response on the shared application client, for the few contracts the emulator cannot produce,
// and are removed when the current test finishes.

function addInitializeMiddleware(middleware: Middleware, label: string): void {
  const name = `test-${label}-${randomUUID()}`
  S3ImagesClient.middlewareStack.add(middleware as never, { step: 'initialize', name })
  onTestFinished(() => {
    S3ImagesClient.middlewareStack.remove(name)
  })
}

/**
 * Drops `fields` from real `commandName` responses (for example `ContentLength` or `Body`), which
 * S3 always sends, so a test reaches the guard for a response without them.
 */
export function omitS3ImagesClientResponseFieldsForTest(
  commandName: string,
  fields: readonly string[],
): void {
  addInitializeMiddleware(
    (next, context) => async args => {
      const result = await next(args)
      if (context.commandName === commandName) {
        const output = result.output as Record<string, unknown>
        for (const field of fields) {
          // A dropped body stream still holds the socket until it is released.
          ;(output[field] as { destroy?: () => void } | undefined)?.destroy?.()
          Reflect.deleteProperty(output, field)
        }
      }
      return result
    },
    'omit-response-fields',
  )
}

/**
 * Caps `ListObjectsV2` pages for one bucket at `maxKeys`, so real continuation tokens appear
 * without seeding more than S3's default 1,000-key page.
 */
export function capS3ImagesClientListPageSizeForTest(bucket: string, maxKeys: number): void {
  addInitializeMiddleware(
    (next, context) => async args => {
      const input = args.input as { Bucket?: string; MaxKeys?: number }
      if (context.commandName === 'ListObjectsV2Command' && input.Bucket === bucket) {
        return next({ ...args, input: { ...input, MaxKeys: maxKeys } })
      }
      return next(args)
    },
    'cap-list-page-size',
  )
}
