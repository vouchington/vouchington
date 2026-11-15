# Email Templates

React Email templates for all Voucha emails live in [`email-templates/`](../../../../email-templates/README.md). The template list, subjects and props are code.

- Templates whose props include `physicalAddress` are commercial or marketing email and must render both a physical mailing address and a visible unsubscribe link, per CAN-SPAM. `MarketingFooter` supplies them and a test enforces it for every such template.
- Templates are rendered at build time into a bundle so React Email and its preview server stay development-only dependencies.
- Recommendation-style emails share one layout so new ones are built on it rather than copied.
- Shared rendering, formatting, and catalog primitives come from `@vouchington/email`; Voucha owns the templates, brand tokens, supported locales, and catalog storage policy.
- Account-change reauthentication uses dedicated security copy and a code-only template. It must not suggest that an unexpected sensitive change can be safely ignored.
- Email delivery guarantees are described in the [queues map](../queues/README.md).

Moderator summaries are assembled over time to keep each job bounded; their figures do not
represent one atomic snapshot. Access and selected content may change during collection, so
delivery checks current eligibility rather than relying on earlier membership.

A saturated count is a lower bound. Derived member changes and activity percentages appear only
when their inputs remain exact; otherwise the email shows the separate counts. This avoids
implying an exact net change or percentage from capped inputs.
