# LLM agents

- Make one structured-decision or single-response call per decision; every entry point takes the
  `{ provider, model }` its service setting holds and has no default model.
- Keep system prompts static or trivially computed; fetch user data through tools instead of
  injecting it into system context.
- Sanitize and wrap external RSS/post/crawl content with `sanitizePromptInjection()` and
  `wrapExternalContent()` from `@jongleberry/vurst-prompt` before LLM use.
