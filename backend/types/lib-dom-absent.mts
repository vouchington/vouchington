// Type-only, zero runtime, zero imports. Encodes "the backend TypeScript program must never load
// lib.dom" as a failing typecheck instead of a comment, so the leak this guards against (#10834)
// cannot regress silently. A type-only import still pulls in a package's declaration file — and
// any `/// <reference lib="..." />` directive inside it — even though nothing at runtime does.
//
// Must stay `.mts`, never `.d.ts`, for two independent reasons:
//   1. playwright/tsconfig.json, integration-tests/tsconfig.json, and test-helpers/tsconfig.json
//      all pull in `backend/types/**/*.d.ts` (declaration files only) into programs that
//      legitimately load lib.dom — a `.d.ts` guard here would fail those programs.
//   2. backend/tsconfig.json and test-helpers/tsconfig.json both set `skipLibCheck: true`, which
//      suppresses errors from `.d.ts` files outright — a `.d.ts` guard would never fire in the one
//      program it exists to protect.
//
// Do not re-export this from backend/types/index.mts. `@voucha/types`'s package.json also exports
// every sibling individually (`"./*"`), so a barrel entry would make every DOM-lib program that
// imports @voucha/types (playwright, integration-tests) fail this assertion.
//
// test-helpers/tsconfig.json extends backend/tsconfig.json yet legitimately shows 2 lib.dom files
// (test-helpers/vitest-config/backend-data-projects.mts imports `vitest/config` by design) — this
// guard is scoped to the backend program only. Do not "fix" that by adding a guard to test-helpers.

type Assert<T extends true> = T

export type BackendProgramExcludesDomLib = Assert<
  typeof globalThis extends { onmessage: unknown }
    ? 'lib.dom leaked into the backend TypeScript program: a backend file transitively imports a package whose declarations carry /// <reference lib="dom" />, which makes @types/node defer every web global to lib.dom. Find it with `tsc --explainFiles --project backend/tsconfig.json`.'
    : true
>
