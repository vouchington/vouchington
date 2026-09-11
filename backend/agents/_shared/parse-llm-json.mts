/**
 * Strips markdown code fences from LLM text responses and parses the result as JSON.
 *
 * LLMs frequently wrap JSON in ``` or ```json fences even when instructed not to.
 * This utility handles both forms and throws a descriptive error on parse failure.
 *
 * Expects the response to start with JSON (or a code fence), not prose. If the
 * model prefixes with text like "Here is the JSON:" the fence will not be stripped.
 * Instruct the model to return only JSON to avoid this.
 */
export function parseLLMJsonResponse<T = unknown>(text: string): T {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  try {
    return JSON.parse(stripped) as T
  } catch (error) {
    const preview = stripped.length > 200 ? `${stripped.slice(0, 200)}…` : stripped
    throw new SyntaxError(`Failed to parse LLM response as JSON: ${preview}`, { cause: error })
  }
}
