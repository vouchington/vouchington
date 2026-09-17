/** Prints every validation error to stderr and exits non-zero. Shared by `validate`/`create`/`update`. */
export function failValidation(errors: string[]): never {
  process.stderr.write('PR body validation failed:\n')
  for (const error of errors) process.stderr.write(`  - ${error}\n`)
  process.exit(1)
}
