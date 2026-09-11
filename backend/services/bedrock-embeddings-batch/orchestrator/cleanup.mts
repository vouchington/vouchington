import { StopModelInvocationJobCommand } from '@aws-sdk/client-bedrock'
import { write } from '@data-stores/psql'
import { BedrockControlClient } from '@modules/aws/bedrock-control'

export const cleanupBatchLocks = async (batchId: string): Promise<void> => {
  await write(
    `/* cleanupBatchLocks */
    DELETE FROM bedrock_embeddings_batch_entities
    WHERE batch_id = $1
  `,
    [batchId],
  )
}

/* no-mistakes: integration=bedrock */
export async function stopBedrockBatch(jobArn: string): Promise<void> {
  await BedrockControlClient.send(
    new StopModelInvocationJobCommand({
      jobIdentifier: jobArn,
    }),
  )
}
