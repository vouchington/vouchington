export const AWS_REGION = process.env.AWS_REGION ?? 'us-west-2'
export const BEDROCK_AWS_REGION = process.env.BEDROCK_AWS_REGION ?? 'us-east-1'

// Bedrock's generated api.aws endpoint names are not live. Opt supported clients in explicitly
// instead of using AWS_USE_DUALSTACK_ENDPOINT globally.
export const AWS_DUALSTACK_CLIENT_CONFIG = { useDualstackEndpoint: true } as const
