import type { ConfigInventory } from './types.mts'

export function formatConfigInventoryMarkdown(inventory: ConfigInventory): string {
  return [
    '# Config Migration Inventory',
    '',
    'Generated from tracked repository files. Run `./dev/config-inventory --format json` for machine-readable output.',
    '',
    '## Environment Variables',
    '',
    '| Name | Classifications | Contract | Sensitivity | Surfaces | Readers | Local setup | Deployment | Workflows | Docs | Package gates | Review |',
    '| ---- | --------------- | -------- | ----------- | -------- | ------- | ----------- | --------------- | --------- | ---- | ------------- | ------ |',
    ...inventory.envVars.map(row =>
      tableRow([
        code(row.name),
        row.classifications.map(code).join(', '),
        row.contractKeys.map(code).join('<br>'),
        row.sensitivity ? code(row.sensitivity) : '',
        row.runtimeSurfaces.map(code).join('<br>'),
        formatFiles(row.readers),
        formatFiles(row.localSetup),
        formatFiles(row.deployment),
        formatFiles(row.workflows),
        formatFiles(row.docs),
        formatFiles(row.packageGates),
        row.reviewReason ?? '',
      ]),
    ),
    '',
    '## DynamicConfig Namespaces',
    '',
    '| Namespace | Definitions | Admin registry |',
    '| --------- | ----------- | -------------- |',
    ...inventory.dynamicConfigs.map(row =>
      tableRow([
        code(row.namespace),
        formatFiles(row.definitionFiles),
        formatFiles(row.registryFiles),
      ]),
    ),
    '',
    '## Package-Manager Gates',
    '',
    '| Gate | Values | Files |',
    '| ---- | ------ | ----- |',
    ...inventory.packageGates.map(row =>
      tableRow([code(row.name), row.values.map(code).join(', '), formatFiles(row.files)]),
    ),
    '',
  ].join('\n')
}

function formatFiles(files: readonly string[]): string {
  return files.length === 0 ? '' : files.map(file => code(file)).join('<br>')
}

function tableRow(cells: readonly string[]): string {
  return `| ${cells.join(' | ')} |`
}

function code(value: string): string {
  return `\`${value.replaceAll('|', String.raw`\|`)}\``
}
