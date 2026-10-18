import { build } from 'esbuild'
import { join } from 'node:path'
import { createEmailBundleOptions } from '@vouchington/email'

await build(
  createEmailBundleOptions({
    entry: join(import.meta.dirname, 'index.mts'),
    outfile: join(import.meta.dirname, 'dist/index.mjs'),
    external: ['@vouchington/localization', '@vouchington/localization-compiler'],
  }),
)
