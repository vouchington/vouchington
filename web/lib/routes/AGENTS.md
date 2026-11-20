# Route factories

- Resolve slug-or-id `params.id` through `getTopic`; pass the resolved `topic.id` UUID to APIs, never raw route params.
- Referral factories reject non-`referral_program` topics with `notFound()`.
- Thin routes outside internal `settings/` bind factory results and explicitly export default/`generateMetadata`; bare re-exports evade metadata detection.
- Signed-out component actions use `useLoginHref(intent)`; gate user-specific content at call sites.
