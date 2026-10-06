import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { format } from 'oxfmt'
import { writeGeneratedFiles } from 'vouchington-tooling/api-fixtures'
import { stableStringify } from '../write.mts'
import { buildOpenApiDocument } from './build-openapi-document.mts'
import { buildRequestContractsBundle } from './request-contract-bundle.mts'
import type { OpenApiDocument } from 'vouchington-tooling/openapi-document'

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url))
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

export async function writeRequestContracts({
  check = false,
  path = requestContractsPath,
  document = buildOpenApiDocument(),
}: {
  check?: boolean
  path?: string
  document?: OpenApiDocument
} = {}): Promise<void> {
  const files = new Map<string, string>([
    [path, await formatWithOxfmt(path, stableStringify(buildRequestContractsBundle(document)))],
  ])
  await writeGeneratedFiles({
    files,
    check,
    staleError: stalePaths =>
      new Error(
        [
          'Runtime request contracts are stale. Run `pnpm run request-contracts:generate` and commit the generated file.',
          ...stalePaths.map(stalePath => `- ${stalePath}`),
        ].join('\n'),
      ),
  })
}

export const requestContractPaths = { requestContractsPath }
