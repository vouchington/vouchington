import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const srcDir = fileURLToPath(new URL('.', import.meta.url))

await build({
  entryPoints: [`${srcDir}index.mts`],
  outfile: `${srcDir}dist/index.mjs`,
  format: 'esm',
  platform: 'node',
  target: 'esnext',
  jsx: 'automatic',
  jsxImportSource: 'react',
  bundle: true,
  banner: {
    js: "import { createRequire } from 'node:module';const require = createRequire(import.meta.url);",
  },
  minify: true,
  logLevel: 'info',
})
