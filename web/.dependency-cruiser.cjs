/**
 * dependency-cruiser configuration for web/
 *
 * Enforces the path-based part of the web-api-no-direct-request-clients guardrail.
 * web/lib/api/ is the permanent owner boundary for the raw request singletons;
 * all other web files must import route-specific helpers from @/lib/api/client
 * or @/lib/api/server instead of @/lib/api/client/instance or
 * @/lib/api/server/instance.
 *
 * The named-binding part (importing clientApi/serverApi by name) is still
 * enforced by the static analysis AST rule web-api-no-direct-request-clients.
 *
 * @/ aliases resolve to web/ via web/tsconfig.dependency-cruiser.json, which
 * extends web/tsconfig.json and adds the baseUrl dependency-cruiser needs.
 *
 * Web source must stay acyclic so route and component dependencies remain
 * easy to reason about.
 */

const path = require('node:path')

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  extends: [
    'dependency-cruiser/configs/rules/not-to-unresolvable',
    'dependency-cruiser/configs/rules/no-circular',
  ],

  forbidden: [
    {
      name: 'web-api-no-direct-request-clients',
      comment:
        'web/lib/api/ owns the raw request singletons. Files outside that boundary ' +
        'may not import ' +
        '@/lib/api/client/instance or @/lib/api/server/instance. ' +
        'Import route-specific helpers from @/lib/api/client or @/lib/api/server instead.',
      severity: 'error',
      from: {
        path: '^web/',
        // Intentional owner boundary, not a temporary exemption. Endpoint helper modules
        // in web/lib/api/ are the only modules allowed to compose the raw singleton clients.
        pathNot: ['^web/lib/api/'],
      },
      to: {
        // @/lib/api/client/instance → web/lib/api/client/instance.*
        // @/lib/api/server/instance → web/lib/api/server/instance.*
        path: '^web/lib/api/(client|server)/instance',
      },
    },
    {
      // Structural guard for the invariant documented at the top of
      // ts-shared/deploy-environment/index.mts: ENVIRONMENT is never available client-side (it is
      // not a NEXT_PUBLIC_-prefixed var), and Next's DefinePlugin inlines every
      // process.env.NODE_ENV in bundled code (client, server, and edge) to the literal
      // 'production'. Importing this accessor from web/** would silently and permanently resolve
      // to 'production'/deployed regardless of the real deploy target. web/** must use a local,
      // ENVIRONMENT-only check instead (see web/lib/utils/image-origin.ts and
      // web/lib/runtime-public-config-server.ts's isDeployedByEnvironment()).
      name: 'web-no-deploy-environment-import',
      comment:
        'web/** may not import @ts-shared/deploy-environment. Its NODE_ENV fallback is unsafe in ' +
        'bundled/Next.js web code — use a local, ENVIRONMENT-only check instead (see ' +
        'web/lib/utils/image-origin.ts).',
      severity: 'error',
      from: {
        path: '^web/',
      },
      to: {
        path: '^ts-shared/deploy-environment(/|$)',
      },
    },
  ],

  options: {
    tsConfig: {
      fileName: path.join(__dirname, 'tsconfig.dependency-cruiser.json'),
    },
    tsPreCompilationDeps: true,
    doNotFollow: {
      path: 'node_modules|\\.next|build',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['browser', 'module', 'main', 'types', 'typings'],
    },
    moduleSystems: ['es6', 'cjs'],
  },
}
