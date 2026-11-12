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
 * Rejects the next `commandName` with `error` after the real stack's retries would have given up,
 * for failures the emulator cannot produce: a 429 carrying `Retry-After`, or a Smithy error marked
 * retryable. Earlier commands in the same test still reach the emulator.
 */
export function failNextS3ImagesClientCommandForTest(commandName: string, error: unknown): void {
  let pending = true
  addInitializeMiddleware(
    (next, context) => async args => {
      if (pending && context.commandName === commandName) {
        pending = false
        throw error
      }
      return next(args)
    },
    'fail-next-command',
  )
}

/**
 * Hands the real `commandName` output to `mutate`, so a test can change what S3 reported (a
 * declared `ContentLength` over the limit) or what its body stream does (a mid-stream reset).
 */
export function mutateS3ImagesClientResponseForTest(
  commandName: string,
  mutate: (output: Record<string, unknown>) => void,
): void {
  addInitializeMiddleware(
    (next, context) => async args => {
      const result = await next(args)
      if (context.commandName === commandName) mutate(result.output as Record<string, unknown>)
      return result
    },
    'mutate-response',
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

/** Commit an owned mutation after a real version listing, before the caller can delete it. */
export function afterS3ImagesClientVersionListForTest(
  bucket: string,
  key: string,
  afterList: () => Promise<void>,
) {
  let pending = true
  let deleteCalls = 0
  addInitializeMiddleware(
    (next, context) => async args => {
      const input = args.input as {
        Bucket?: string
        Prefix?: string
        Delete?: { Objects?: { Key?: string }[] }
      }
      if (
        context.commandName === 'DeleteObjectsCommand' &&
        input.Bucket === bucket &&
        input.Delete?.Objects?.some(object => object.Key === key)
      )
        deleteCalls += 1
      const result = await next(args)
      if (
        pending &&
        context.commandName === 'ListObjectVersionsCommand' &&
        input.Bucket === bucket &&
        input.Prefix === key
      ) {
        pending = false
        await afterList()
      }
      return result
    },
    'after-owned-version-list',
  )
  return { deleteCalls: () => deleteCalls }
}
