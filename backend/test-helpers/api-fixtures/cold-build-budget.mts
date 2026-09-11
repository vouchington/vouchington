/**
 * Timeout budgets for backend contract tests that build (or, under isolate: false shared forks,
 * may end up being the one that builds) an expensive `ts.Program` as part of the test itself —
 * not warm-assertion time against an already-cached result. Each constant is keyed to *what* gets
 * built, not just "how long a cold build feels ok" — picking the wrong one either flakes (the
 * smaller virtual-program budget on a full-program build) or hides a real regression (the largest
 * budget everywhere lets a genuine full-backend-program slowdown pass unnoticed on a cheap
 * virtual/string-source test).
 */

/**
 * Full `backend/tsconfig.json` type-check via loadBackendProgram() (memoized after the first
 * build within a module lifetime — see backend-program.mts). Use for tests that exercise
 * loadBackendResponseContracts(), loadBackendRequestContracts(), loadBackendQueryContracts(), or
 * loadRegisteredRouteCatalog() against the real backend route tree, where fork ordering under
 * isolate: false means this specific test could be the one that pays the cold build. Tests that
 * intentionally force or permit multiple full builds compose this per-build budget by their exact
 * expected or maximum permitted build count.
 */
export const COLD_BACKEND_PROGRAM_TIMEOUT_MS = 60_000

/**
 * One virtual/string-source ts.Program per test file via buildVirtualProgramMatrix() — a matrix of
 * independent in-memory declaration files rather than every route file under backend/api/v1, so
 * much cheaper than the full backend program while avoiding one compiler build per test case.
 */
export const COLD_VIRTUAL_PROGRAM_TIMEOUT_MS = 15_000

/**
 * Full OpenAPI document generation: builds the full backend program (registered-route catalog,
 * response/request/query contract discovery) and then walks every route to assemble the document
 * — strictly more work than COLD_BACKEND_PROGRAM_TIMEOUT_MS alone, plus (for the spec-validation
 * case) shelling out to `redocly lint`. The most expensive tier.
 */
export const COLD_OPENAPI_BUILD_TIMEOUT_MS = 90_000
