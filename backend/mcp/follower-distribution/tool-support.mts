import {
  MAX_SELECTED_FOLLOWER_DISTRIBUTION_RECIPIENTS,
  markFollowerDistributionFailed,
  type FollowerDistributionAccepted,
} from '@services/follower-distributions'
import { enqueueProcessFollowerDistribution } from '@queues/follower-distributions/enqueues'
import { objectSchema } from '../output-schema-shapes.mts'
import { userReferenceSchema } from '../entity-reference-schema.mts'

const UUID_SCHEMA = { type: 'string', format: 'uuid' }

export const DISTRIBUTION_OUTPUT_SCHEMA = objectSchema({
  status: { const: 'accepted' },
  distribution_id: UUID_SCHEMA,
})

/** The share input, or the send input with its all or selected follower audience, for one target. */
export function distributionParameters(
  targetField: string,
  targetSchema: Record<string, unknown>,
  send: boolean,
) {
  if (!send) {
    return {
      type: 'object',
      properties: { [targetField]: targetSchema },
      required: [targetField],
    }
  }
  return {
    type: 'object',
    oneOf: [
      {
        type: 'object',
        properties: { [targetField]: targetSchema, audience: { const: 'all_followers' } },
        required: [targetField, 'audience'],
      },
      {
        type: 'object',
        properties: {
          [targetField]: targetSchema,
          audience: { const: 'selected_followers' },
          recipient_user_ids: {
            type: 'array',
            items: userReferenceSchema,
            minItems: 1,
            maxItems: MAX_SELECTED_FOLLOWER_DISTRIBUTION_RECIPIENTS,
            uniqueItems: true,
          },
        },
        required: [targetField, 'audience', 'recipient_user_ids'],
      },
    ],
  }
}

/** Queue an accepted distribution; an enqueue failure is recorded on it before it is rethrown. */
export async function enqueueDistributionOrMarkFailed(
  result: FollowerDistributionAccepted,
): Promise<FollowerDistributionAccepted> {
  try {
    await enqueueProcessFollowerDistribution(result.distribution_id)
  } catch (err) {
    await markFollowerDistributionFailed(
      result.distribution_id,
      'Failed to enqueue follower distribution',
    )
    throw err
  }
  return result
}
