export const fixtures = [
  {
    path: 'playwright/support/other-framework.spec.mts',
    source: "import { test } from '@playwright/test'; test('other framework', async () => {})",
    rejected: false,
  },
  {
    path: 'web/lib/oversized.test.tsx',
    source: "import { test as check } from 'vitest'; check('slow', { timeout: 30001 }, () => {})",
    rejected: true,
  },
  {
    path: 'web/lib/unknown-hook.test.ts',
    source: "import { afterAll } from 'vitest'; afterAll(() => {}, Number(process.env.DEADLINE))",
    rejected: true,
  },
  {
    path: 'web/lib/bounded.test.ts',
    source: "import { test } from 'vitest'; test('bounded', { timeout: 30000 }, () => {})",
    rejected: false,
  },
  {
    path: 'backend/modules/oversized.test.mts',
    source:
      "import { it } from 'vitest'; const timeout = 31 * 1000; it('slow', { timeout }, () => {})",
    rejected: true,
  },
  {
    path: 'backend/modules/unknown.test.mts',
    source:
      "import { it } from 'vitest'; it('unknown', { timeout: Number(process.env.DEADLINE) }, () => {})",
    rejected: true,
  },
  {
    path: 'backend/modules/bounded.test.mts',
    source:
      "import { it, afterEach } from 'vitest'; afterEach(() => {}, 30000); it('bounded', { timeout: 30000 }, () => {})",
    rejected: false,
  },
  {
    path: 'backend/modules/defaults.mts',
    source:
      "import { defineConfig } from 'vitest/config'; export default defineConfig({ test: { testTimeout: 15000, hookTimeout: 30000 } })",
    rejected: true,
    allowedByRootMaximum: true,
    diagnosticsWhenRejected: 2,
  },
  {
    path: 'backend/modules/vitest.config.mts',
    source:
      "import { defineConfig } from 'vitest/config'; import projects from './projects.mts'; export default defineConfig({ test: { projects } })",
    rejected: true,
  },
  {
    path: 'vitest.config.mts',
    source:
      "import { defineConfig } from 'vitest/config'; import projects from './projects.mts'; export default defineConfig({ test: { projects } })",
    rejected: true,
    allowedByRootMaximum: true,
  },
  {
    path: 'backend/test-helpers/other-project.test.mts',
    source: "import { it } from 'vitest'; it('outside this project', () => {}, 30001)",
    rejected: true,
  },
  {
    path: 'test-helpers/alias.test.mts',
    source: "import { it as check } from 'vitest'; check('slow', () => {}, 30 * 1000 + 1)",
    rejected: true,
  },
  {
    path: 'test-helpers/runtime.test.mts',
    source: "import { vi as runtime } from 'vitest'; runtime.setConfig({ testTimeout: 30001 })",
    rejected: true,
  },
  {
    path: 'test-helpers/unknown.test.mts',
    source: "import { afterEach } from 'vitest'; afterEach(() => {}, Number(process.env.DEADLINE))",
    rejected: true,
  },
  {
    path: 'test-helpers/bounded.test.mts',
    source: "import { it } from 'vitest'; it('bounded', { timeout: 30000 }, () => {})",
    rejected: false,
  },
  {
    path: '.pr-shepherd/__tests__/unknown.test.mts',
    source: "import { it } from 'vitest'; it('unknown', () => {}, Number(process.env.DEADLINE))",
    rejected: true,
  },
  {
    path: '.agents/catalog/hook.test.mts',
    source: "import { afterEach } from 'vitest'; afterEach(() => {}, 30001)",
    rejected: true,
  },
  {
    path: '.github/workflows/deadline.test.mts',
    source: "import { it as check } from 'vitest'; check('slow', () => {}, 30 * 1000 + 1)",
    rejected: true,
  },
  {
    path: 'backend/dependency-cruiser-rules/slow.test.mts',
    source: "import { it } from 'vitest'; it('slow', { timeout: 30001 }, () => {})",
    rejected: true,
  },
  {
    path: 'backend/dependency-cruiser-rules/bounded.test.mts',
    source: "import { it } from 'vitest'; it('bounded', { timeout: 30000 }, () => {})",
    rejected: false,
  },
  {
    path: '.husky/alias.test.mts',
    source: "import { it as check } from 'vitest'; check('slow', () => {}, 30 * 1000 + 1)",
    rejected: true,
  },
  {
    path: '.husky/unknown.test.mts',
    source:
      "import { beforeEach } from 'vitest'; beforeEach(() => {}, Number(process.env.DEADLINE))",
    rejected: true,
  },
  {
    path: '.husky/runtime.test.mts',
    source: "import { vi } from 'vitest'; vi.setConfig({ testTimeout: 30001 })",
    rejected: true,
  },
  {
    path: '.husky/bounded.test.mts',
    source:
      "import { it, afterEach, vi } from 'vitest'; vi.setConfig({ testTimeout: 30000 }); afterEach(() => {}, 30000); it('bounded', { timeout: 30000 }, () => {})",
    rejected: false,
  },
  {
    path: 'ci/alias.test.mts',
    source:
      "import { it as check } from 'vitest'; const seconds = 60; check('slow', () => {}, seconds * 1000)",
    rejected: true,
  },
  {
    path: 'dev/hook.test.mts',
    source: "import { beforeEach as setup } from 'vitest'; setup(() => {}, 30001)",
    rejected: true,
  },
  {
    path: 'static-code-analysis/table.test.mts',
    source: "import { test } from 'vitest'; test.each([1])('slow', { timeout: 30001 }, () => {})",
    rejected: true,
  },
  {
    path: 'ci/runtime.test.mts',
    source: "import { vi as runtime } from 'vitest'; runtime.setConfig({ testTimeout: 0 })",
    rejected: true,
  },
  {
    path: 'ci/unknown.test.mts',
    source:
      "import { it } from 'vitest'; const deadline = Number(process.env.DEADLINE); it('unknown', () => {}, deadline)",
    rejected: true,
  },
  {
    path: 'dev/config.mts',
    source:
      "import { defineConfig } from 'vitest/config'; export default defineConfig({ test: { testTimeout: 5001 } })",
    rejected: true,
  },
  {
    path: 'ci/bounded.test.mts',
    source:
      "import { it, beforeEach } from 'vitest'; const timeout = 30 * 1000; beforeEach(() => {}, timeout); it('bounded', { timeout }, () => {})",
    rejected: false,
  },
  {
    path: 'dev/known-config.mts',
    source:
      "import { defineConfig } from 'vitest/config'; export default defineConfig({ test: { testTimeout: 5000, hookTimeout: 5000 } })",
    rejected: false,
  },
  {
    path: 'static-code-analysis/unrelated.mts',
    source:
      'const client = { test(_name, _options, _callback) {} }; client.test("request", { timeout: 60000 }, () => {})',
    rejected: false,
  },
] as const
