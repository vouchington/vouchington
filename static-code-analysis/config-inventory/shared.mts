export function shouldSkipFile(file: string): boolean {
  return (
    file === 'backend/data-stores/psql/schema-snapshot/schema.json' ||
    file.startsWith('.agents/') ||
    file.includes('/node_modules/') ||
    file === 'pnpm-lock.yaml' ||
    file.includes('.test.') ||
    file.includes('.mock.') ||
    file.includes('.spec.') ||
    file.includes('.fixture.') ||
    file.includes('/__fixtures__/') ||
    file.includes('/fixtures/') ||
    file.endsWith('.lock') ||
    file.endsWith('.png') ||
    file.endsWith('.jpg') ||
    file.endsWith('.jpeg') ||
    file.endsWith('.webp') ||
    file.endsWith('.gif') ||
    file.endsWith('.pdf') ||
    file.endsWith('.zip')
  )
}
