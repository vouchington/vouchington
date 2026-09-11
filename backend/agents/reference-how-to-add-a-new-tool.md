# How to Add a New Tool

[Back to Agents Architecture](README.md#how-to-add-a-new-tool)

1. Create `backend/tools/<name>.mts` following the `Tool<TArgs, TResult>` pattern
2. Import service functions — wrap existing services, no new backend logic in tools
3. Use `currentUser as unknown as PrivateUser` if the tool needs an authenticated user
4. Add `strict: null` to the schema (repo convention: leave provider strict-mode unset)
5. Write `backend/tools/<name>.test.mts` — real DB test with `createTestUser()` in `beforeAll`
6. Import the tool in any agent's `tool.mts` that should expose it
7. Update the agent's `build-system-prompt.mts` to document the new tool

### Tool file structure

```typescript
import type { Tool } from '@voucha/tools'
import { someService } from '@services/some-service'

type Args = { topic_id: string }
type Result = { success: true; data: string } | { success: false; error: string }

const myTool: Tool<Args, Result> = {
  schema: {
    name: 'my_tool',
    type: 'function',
    strict: null,
    description: 'What this tool does',
    parameters: {
      type: 'object',
      properties: {
        topic_id: { type: 'string', description: 'The topic ID' },
      },
      required: ['topic_id'],
    },
  },
  function: currentUser => async args => {
    const result = await someService(args.topic_id)
    if (!result) return { success: false, error: 'Not found' }
    return { success: true, data: result.name }
  },
}

export default myTool
```
