// Bundles the image-resize Lambda handler into dist/index.mjs for AWS Lambda
// (nodejs24.x runtime, arm64). Sharp and AWS SDK packages are externalized:
// - @aws-sdk/* is provided by the Lambda runtime
// - sharp ships a native binary that must be installed for the linux-arm64
//   target separately (see the build:deps npm script)
// - @sentry/aws-serverless is bundled (not externalized) because sentry-init.mts
//   imports it directly; externalizing would leave an unresolved import in the zip

import { build } from 'esbuild'

const external = ['sharp', '@aws-sdk/*']

await build({
  entryPoints: {
    index: 'index.mts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  sourcemap: true,
  external,
  banner: {
    // ESM shims for require/__dirname/__filename in case any externalized
    // CJS dependency expects them at runtime.
    js: [
      "import { createRequire as __vouchaCreateRequire } from 'node:module';",
      "import { fileURLToPath as __vouchaFileURLToPath } from 'node:url';",
      "import { dirname as __vouchaDirname } from 'node:path';",
      'const require = __vouchaCreateRequire(import.meta.url);',
      'const __filename = __vouchaFileURLToPath(import.meta.url);',
      'const __dirname = __vouchaDirname(__filename);',
    ].join('\n'),
  },
  logLevel: 'info',
})
