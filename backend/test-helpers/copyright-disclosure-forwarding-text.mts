/** The statutory forwarding payload identifies precisely the owned material and declarations. */
export function expectedDisclosureForwardingText(
  target: { id: string; hosted_use_url: string },
  earliest: Date,
) {
  return `${[
    'Voucha received the following counter-notice under 17 U.S.C. 512(g).',
    '',
    'Name: Poster',
    'Address: 1 Main Street',
    'Telephone: 555-0100',
    'Material identified for restoration:',
    `- Target ID: ${target.id}`,
    `  Hosted URL: ${target.hosted_use_url}`,
    'Statement under penalty of perjury: I have a good faith belief that the material was removed or disabled as a result of mistake or misidentification. Accepted.',
    'Consent to federal jurisdiction: I consent to the jurisdiction of the Federal District Court for the judicial district in which my address is located, or, if my address is outside the United States, any judicial district in which Voucha may be found. Accepted.',
    'Consent to service of process: I will accept service of process from the person who provided the notification under subsection (c)(1)(C), or an agent of that person. Accepted.',
    'Electronic signature: Poster',
    '',
    `Unless we receive qualifying notice of a court action before then, we may restore the material on or after ${earliest.toISOString()}.`,
  ].join('\n')}\n\nAutomated tools assisted with processing this case.`
}
