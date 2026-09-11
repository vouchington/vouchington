/**
 * dependency-cruiser configuration for lambdas/
 *
 * Enforces the lambdas-imports guardrail:
 * lambdas/* must not import from backend internals
 * (@modules/*, @data-stores/*, @queues/*, or relative paths into backend/).
 * Lambdas must be self-contained.
 */

const path = require('node:path')

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'not-to-unresolvable',
      comment: 'lambda imports must resolve to source files or installed packages.',
      severity: 'error',
      from: {},
      to: {
        couldNotResolve: true,
      },
    },
    {
      name: 'no-circular',
      comment: 'lambda source should stay acyclic and self-contained.',
      severity: 'error',
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: 'lambdas-imports',
      comment:
        'lambdas/* must not import from backend internals. ' +
        'Lambdas should be self-contained — copy necessary types and configs instead.',
      severity: 'error',
      from: {
        path: '^lambdas/',
      },
      to: {
        path: '^(backend/|@modules/|@data-stores/|@queues/)',
      },
    },
  ],

  options: {
    tsConfig: {
      fileName: path.join(__dirname, 'tsconfig.json'),
    },
    tsPreCompilationDeps: true,
    doNotFollow: {
      path: 'node_modules|build',
    },
    moduleSystems: ['es6', 'cjs'],
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'node', 'default'],
    },
  },
}
