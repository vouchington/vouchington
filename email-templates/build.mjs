import { build } from 'esbuild'
import { join } from 'node:path'

const srcDir = import.meta.dirname

await build({
  entryPoints: [join(srcDir, 'index.mts')],
  outfile: join(srcDir, 'dist/index.mjs'),
  format: 'esm',
  platform: 'node',
  target: 'esnext',
  jsx: 'automatic',
  jsxImportSource: 'react',
  bundle: true,
  external: ['@vouchington/localization', '@vouchington/localization-compiler'],
  banner: {
    js: "import { createRequire } from 'node:module';const require = createRequire(import.meta.url);",
  },
  minify: true,
  logLevel: 'info',
})
