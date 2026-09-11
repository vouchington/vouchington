import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { format } from 'oxfmt'
import { writeOpenApi as writeFromTooling } from 'vouchington-tooling/openapi-document'
import { stableStringify } from '../write.mts'
import { buildOpenApiDocument } from './build-openapi-document.mts'

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url))
const openApiPath = join(repoRoot, 'api-fixtures/v1/openapi.json')

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
  try {
    await writeFromTooling({
      path,
      document: buildOpenApiDocument(),
      check,
      format: formatWithOxfmt,
      stringify: stableStringify,
    })
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.endsWith('Regenerate the OpenAPI document and commit it.')
    ) {
      throw new Error(
        `${path} is stale. Run \`pnpm run openapi:generate\` and commit the changes.`,
        { cause: error },
      )
    }
    throw error
  }
}

export const openApiPaths = { openApiPath }
