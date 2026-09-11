# Private Internal Reference Sites

This runbook launches and operates the private OpenAPI, PostgreSQL, and Storybook references.
Every surface uses HTTP Basic Auth with the same operator-held credential list.

| Surface      | URL                                   | Hosting                    |
| ------------ | ------------------------------------- | -------------------------- |
| Landing page | `https://docs.voucha.ai/`             | R2 through the docs Worker |
| OpenAPI      | `https://docs.voucha.ai/openapi/`     | R2 through the docs Worker |
| PostgreSQL   | `https://docs.voucha.ai/psql/`        | R2 through the docs Worker |
| Storybook    | `https://voucha-storybook.pages.dev/` | Cloudflare Pages           |

## Contents

- <a id="security-boundaries"></a>[Security boundaries](reference-private-docs-site-security-boundaries.md)
- <a id="source-of-truth"></a>[Source of truth](reference-private-docs-site-source-of-truth.md)
- <a id="required-github-configuration"></a>[Required GitHub configuration](reference-private-docs-site-required-github-configuration.md)
- <a id="enable"></a>[Enable](reference-private-docs-site-enable.md)
- <a id="verify"></a>[Verify](reference-private-docs-site-verify.md)
- <a id="rotation-and-recovery"></a>[Rotation and recovery](reference-private-docs-site-rotation-and-recovery.md)
- <a id="disable"></a>[Disable](reference-private-docs-site-disable.md)
- <a id="see-also"></a>[See also](reference-private-docs-site-see-also.md)
