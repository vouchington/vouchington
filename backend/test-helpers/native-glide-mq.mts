import { createRequire } from 'node:module'

/** Public Node entry selects the native SDK independently of the ordinary test-provider alias. */
export const nativeGlideMq = createRequire(import.meta.url)('glide-mq') as typeof import('glide-mq')
