---
title: 'How Copyright Complaints Work'
slug: copyright-complaints
post_type: article
topics:
  - voucha
  - moderation
  - trust
---

# How Copyright Complaints Work

This guide covers how to file a copyright notice, how to respond if your image is taken down, and what happens at each step. For the policy itself, read [Copyright and the DMCA on Voucha](./copyright-and-dmca.md).

Our copyright process handles US claims under the DMCA. It opens once our designated agent is registered. The status page at `/copyright/designated-agent` shows whether it's open yet.

## Before You File Anything

Under 17 U.S.C. § 512(f), anyone who knowingly makes a material misrepresentation that material is infringing, or that material was removed or disabled by mistake or misidentification, can be liable for damages, including costs and attorneys' fees.

That means:

- **Filing a notice?** Make sure you own the work or are authorized to act for the owner. Check whether the use could be fair use, such as commentary, criticism or news reporting. If you're unsure, talk to a lawyer before filing.
- **Filing a counter-notice?** Only file one if you believe in good faith that the image was removed by mistake or misidentification. If you're unsure, talk to a lawyer.

## Filing a Copyright Notice

Use the form at `/copyright/notices/new`. You don't need to sign in. The form asks for:

- your full legal name, mailing address and email;
- a description of your copyrighted work;
- the link to the Voucha post, and which of its images you're reporting;
- a statement that you believe in good faith the use isn't authorized by the owner, their agent or the law;
- a statement, under penalty of perjury, that your notice is accurate and that you're authorized to act for the owner; and
- your electronic signature.

Once the designated agent's contact details are published on `/copyright/designated-agent`, you can also send a written notice there. Use that route if you can't open the image yourself.

**Your privacy:** if we accept your notice and you filed while signed in, signed-in members can see the case with your current public Voucha profile. If you filed without signing in, the case shows no profile for you. Your legal name, contact details and signature aren't shown on the case.

## What Happens After a Notice

1. **We confirm we got it.** We email you a receipt.
2. **A moderator reviews it.** Automated tools may assist or provisionally withhold an image pending review, but a person reviews the decision. We don't act on a notice that's missing required information. If something is missing, the moderator emails you at the address on your notice to ask for it.
3. **If we accept it,** the image is hidden in that post for everyone. The rest of the post stays up, and other posts aren't changed. The poster gets an email and an in-app notice with the reasons and redress routes, and you receive a decision email. The case appears at `/copyright/notices`.

A case records a claim. It doesn't decide who owns the work or whether anyone infringed.

**If you filed without signing in,** you can't follow the case online. The confirmation page and your receipt email show your case ID, so keep it. If we send you an access token for the case, you can use it at `/copyright/notices/:id/guest` to correct your notice, withdraw it, or report a court or Copyright Claims Board filing.

## If Your Image Was Taken Down

You'll get an email and an in-app notice with the reasons, including whether automated tools assisted. You can see your notices on the case at `/copyright/notices`. A human review and a later restriction-ended notice explain any change. Signed in as the poster, you have two options.

### Option 1: Appeal

Use `/copyright/notices/:id/appeal` to tell a moderator why the decision should change, for example because the image is yours or you have a license. Choose which images the appeal covers. An appeal is an ordinary review. It doesn't ask for your legal name or contact details, and it doesn't start a legal clock.

### Option 2: Counter-Notice

A counter-notice is a legal statement that the image was removed by mistake or misidentification. Use `/copyright/notices/:id/counter-notice`. It asks for:

- your full legal name, mailing address and telephone number;
- which images you want restored;
- a statement, under penalty of perjury, that you believe in good faith the image was removed by mistake or misidentification;
- consent to the jurisdiction of the federal district court for your address or, if you live outside the US, any district where Voucha may be found;
- agreement to accept service of legal papers from the person who filed the notice, or their agent; and
- your electronic signature.

**Your privacy:** if we accept your counter-notice, we send your name, address, telephone number, signature and statements to the person who filed the notice, or their agent. That lets them take legal action against you if they choose. Think about this before you file.

## The Counter-Notice Timeline

1. **We receive your counter-notice.** A moderator checks that it's complete.
2. **We forward it** to the person who filed the notice.
3. **We restore the image 10 to 14 business days** after we received your valid counter-notice. Business days follow the US federal calendar, in New York time. We restore only the images your counter-notice lists.

The image stays hidden if, before we restore it, the person who filed the notice tells our designated agent they've filed a federal lawsuit or a Copyright Claims Board (CCB) claim against you about the same image. A threat to sue isn't enough; the case must actually be filed. The image stays hidden while that case is open.

If the image is also hidden for another reason, such as a different notice, it stays hidden until that is resolved too.

## Repeat Infringers

Our repeat-infringer policy is at `/copyright/repeat-infringer-policy`.

## Related

- [Copyright and the DMCA on Voucha](./copyright-and-dmca.md)
- [What Happens When Content Is Removed](./what-happens-when-content-is-removed.md)
- [Terms of Service](./terms-of-service.md)
- [Privacy Policy](./privacy-policy.md)
- [Community Guidelines](./community-guidelines.md)
