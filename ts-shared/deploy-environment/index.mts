// Deploy-environment accessor shared by backend, lambdas, and Node-side web server code.
//
// The backend and worker ECS Fargate task definitions and the image-resize Lambda set both
// NODE_ENV and ENVIRONMENT to the real deploy target ('staging' | 'production'); ENVIRONMENT
// remains the authority (it's the value OpenTofu injects and validates via var.environment,
// while NODE_ENV is also widely read by Node/npm tooling itself). The web ECS task definition
// is the one exception: its NODE_ENV stays hardcoded "production" because Next's standalone
// server.js unconditionally re-asserts `process.env.NODE_ENV = 'production'` at boot regardless
// of what ECS injects (see vouchington-infra/opentofu/ecs-web.tf), so ENVIRONMENT is the only signal that reflects
// the real deploy target for web server-side code. Prefer ENVIRONMENT; fall back to NODE_ENV
// when ENVIRONMENT is unset (developer laptops, most CI jobs), and fall back to 'development'
// when neither is set.
//
// This accessor never throws — it is meant for call sites that want a best-effort deploy
// environment classification. Callers that need a narrow domain with a fail-fast guard on
// unrecognized values (e.g. S3 bucket resolution) should layer their own throwing wrapper on
// top of `getDeployEnvironment()` rather than relying on this module for that guarantee.
//
// Do not import this module from web code that is bundled into the browser: ENVIRONMENT is
// never available client-side (it is not a NEXT_PUBLIC_-prefixed var), and Next's DefinePlugin
// inlines every `process.env.NODE_ENV` in bundled code (client, server, and edge) to the
// literal 'production'. Calling this accessor from client-bundled code would silently and
// permanently resolve to 'production' / deployed, regardless of the real deploy target. Web
// server-only code may import it; bundled web code must use a local, ENVIRONMENT-only check
// instead (see web/lib/utils/image-origin.ts).

export {
  getDeployEnvironment,
  isDeployedEnvironment,
  isProductionEnvironment,
} from '@vouchington/utils/deploy-environment'
export type {
  DeployEnvironment,
  DeployEnvironmentSource,
} from '@vouchington/utils/deploy-environment'
