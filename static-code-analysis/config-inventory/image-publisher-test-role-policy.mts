import type { ConfigInventory } from './types.mts'

/** Image publishing uses the documented test role without borrowing ECR deployment permissions. */
export function checkImagePublisherTestRole(inventory: ConfigInventory): string[] {
  const role = inventory.envVars.find(row => row.name === 'AWS_TEST_ROLE_ARN')
  const errors: string[] = []
  const doc = 'docs/development/reference-ci-ci-job-conditions.md'
  if (!role?.docs.includes(doc)) errors.push(`AWS_TEST_ROLE_ARN must be documented in ${doc}`)
  for (const path of [
    '.github/workflows/publish-backend-images.yml',
    '.github/workflows/publish-web-images.yml',
  ]) {
    if (!role?.workflows.includes(path))
      errors.push(`AWS_TEST_ROLE_ARN must be referenced by ${path}`)
  }
  return errors
}
