import { isDeployedEnvironment, type DeployEnvironmentSource } from '@ts-shared/deploy-environment'

// `env` lets tests pin ENVIRONMENT/NODE_ENV per call instead of mutating process.env, which leaks
// across parallel Vitest files under isolate: false. Production callers omit it.
export const sanitizeEmailAddress = (
  emailAddress: string,
  env: DeployEnvironmentSource = process.env,
): string => {
  // Trim and lowercase
  let sanitized = emailAddress.trim().toLowerCase()

  // On a deployed environment (staging or production), remove '+' and everything after it
  // (before '@'). Deliberately IS_DEPLOYED rather than IS_PRODUCTION: this changes account-dedup
  // semantics (a+1@x and a+2@x collide vs. don't), and staging should keep production's dedup
  // semantics so signup testing exercises the behavior real users will hit.
  if (isDeployedEnvironment(env)) {
    const atIndex = sanitized.indexOf('@')
    if (atIndex > 0) {
      const localPart = sanitized.slice(0, atIndex)
      const domainPart = sanitized.slice(atIndex)
      const plusIndex = localPart.indexOf('+')

      if (plusIndex > 0) {
        sanitized = localPart.slice(0, plusIndex) + domainPart
      }
    }
  }

  return sanitized
}
