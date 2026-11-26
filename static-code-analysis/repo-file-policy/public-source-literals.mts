import type { SharedContext } from 'vouchington-tooling/shared-context'
import { checkPublicSourceLiterals as checkUpstream } from 'vouchington-tooling/public-source-literals'

export function checkPublicSourceLiterals(ctx: SharedContext): Promise<{ errors: string[] }> {
  return checkUpstream(ctx, {
    allowedS3Buckets: ['developer-image-uploads'],
    extraPatterns: [
      {
        category: 'private infrastructure repository link',
        expression: /\bvouchington-infra\/(?:blob|tree)\//i,
      },
      {
        category: 'AWS profile name',
        expression:
          /(?:PROFILE|READ_PROFILE)=(?!(?:["']?(?:<|\$)))["']?[A-Za-z0-9][A-Za-z0-9_-]*["']?/,
        appliesTo: file => /\.(?:md|txt)$/.test(file),
      },
    ],
  })
}
