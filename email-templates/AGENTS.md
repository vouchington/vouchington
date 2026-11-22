# Email templates

- Load skills: `voucha-brand`.
- Template docs: [email template index](../docs/overview/architecture/email-templates/README.md).
- `@email-templates/core` exports prebuilt `dist/index.mjs`. Bundle React Email/React/React DOM
  here; keep them out of backend runtime dependencies.
- Recommendation emails mirror an existing in-app aside/recommendation source before copy is written.
