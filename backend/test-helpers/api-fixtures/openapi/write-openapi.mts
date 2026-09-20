import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { format } from 'oxfmt'
import { writeGeneratedFiles } from 'vouchington-tooling/api-fixtures'
import { stableStringify } from '../write.mts'
import { buildOpenApiDocument } from './build-openapi-document.mts'
import { buildRequestContractsBundle } from './request-contract-bundle.mts'

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url))
const openApiPath = join(repoRoot, 'api-fixtures/v1/openapi.json')
const requestContractsPath = join(repoRoot, 'api-fixtures/v1/request-contracts.json')

async function formatWithOxfmt(path: string, rawJson: string): Promise<string> {
  const result = await format(path, rawJson)
  if (result.errors.length > 0) {
    throw new Error(
      `oxfmt failed to format ${path}:\n${result.errors.map(err => err.message).join('\n')}`,
    )
  }
  return result.code
}

export async function writeOpenApi({
  check = false,
  path = openApiPath,
}: {
  check?: boolean
  path?: string
} = {}): Promise<void> {
  const document = buildOpenApiDocument()
  const runtimePath =
    path === openApiPath ? requestContractsPath : join(path, '..', 'request-contracts.json')
  const files = new Map<string, string>()
  files.set(path, await formatWithOxfmt(path, stableStringify(document)))
  files.set(
    runtimePath,
    await formatWithOxfmt(runtimePath, stableStringify(buildRequestContractsBundle(document))),
  )
  await writeGeneratedFiles({
    files,
    check,
    staleError: stalePaths =>
      new Error(
        [
          'OpenAPI runtime contracts are stale. Run `pnpm run openapi:generate` and commit both generated files.',
          ...stalePaths.map(stalePath => `- ${stalePath}`),
        ].join('\n'),
      ),
  })
}

export const openApiPaths = { openApiPath, requestContractsPath }
