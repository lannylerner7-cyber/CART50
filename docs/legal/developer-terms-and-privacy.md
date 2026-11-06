# MainVault Wallet — Developer Sandbox Terms and Privacy Notice

**Status: DRAFT FOR OWNER AND LEGAL REVIEW — NOT EFFECTIVE**

Draft version: `sandbox-review-2026-11-06`

This document is a drafting aid, not legal advice. It must not be represented
as approved, published as an effective agreement, or used to enable registration
until the unresolved items below are completed and the operator approves it.

## Publication checklist — not part of the customer agreement

- Operator name supplied by the owner: **MainVault Wallet**. Confirm the legal
  person responsible for the service and its address; this draft does not
  assert incorporation, licensing, or regulatory approval.
- Country of incorporation or operation: owner supplied **“None.”** Country,
  applicable privacy law, governing law and dispute venue remain unresolved.
- Proposed public contact: **support@mainvaultwallet.com**. Confirm that this
  mailbox receives and is monitored for support, security and privacy requests.
- Confirm the proposed 18+ eligibility rule, fees policy, change-notice period,
  liability language and actual retention periods before publication.
- Confirm the deployed service providers, processing locations, contracts and
  international-transfer safeguards. Source configuration is not proof of the
  production setup.
- Approve an effective date and final version. Remove this checklist and draft
  labels from the final approved customer text, not from an unapproved draft.

---

## Part A — Developer Sandbox Terms

### 1. Operator, scope and acceptance

These terms govern access to the MainVault Wallet developer Sandbox, its test
APIs, hosted test checkout, documentation and related developer tools.
“We” means the operator identified in the final published notice. “You” means
the person or organization applying for developer access.

By expressly accepting the published version during registration, you agree to
these terms. If acting for an organization, you must have authority to bind it.
The privacy notice below explains personal-data processing; accepting these
terms is not blanket consent to unrelated marketing or data uses.

**Proposed eligibility:** users must be at least 18 and legally able to enter
this agreement. This requirement needs operator confirmation.

### 2. What the Sandbox provides

The Sandbox is for developing and testing integrations. Its balances, credits,
payment events and receipts are simulated and have no monetary or redemption
value. A displayed fiat equivalent is illustrative, not a cash deposit, debt
owed to you, guaranteed exchange rate, or entitlement to Bitcoin.

Do not send funds to Sandbox identifiers or use simulated confirmations to
release real goods, services or funds. The Sandbox does not provide live
custody, banking, exchange, investment advice or payment settlement.

Applying for Live access or receiving an administrative approval does not by
itself activate live transfers. Live services require separate readiness checks,
authorization and applicable agreements. Developer access never grants access
to the operator's separate personal vault.

### 3. Registration and account security

Provide accurate account information and an email address you control. Complete
email verification and required passkey enrollment. Protect your login key,
passkeys, API keys and webhook signing secrets. Do not put server API keys in
public repositories, browser JavaScript, screenshots or support messages.

Use the supported recovery and rotation tools. Tell us promptly about suspected
compromise at support@mainvaultwallet.com, without sending credentials. Keep
your own integration configuration and test records. Never submit seed phrases,
wallet private keys or unrelated sensitive personal information.

### 4. API use, checkout and webhooks

Use only endpoints and permissions granted to your account. Observe documented
request limits, timeout handling, idempotency and retry requirements. Access is
subject to capacity controls; no unlimited throughput or availability is promised.

Your application must verify webhook signatures against the raw request body,
validate timestamps and expected account/order/amount/status, and process
duplicate events safely. Webhooks may be delayed, repeated or delivered out of
order. Reconcile status through the documented API when needed.

A browser redirect, QR scan or “I've sent” button is not proof of payment.
In the Sandbox, completion comes from the explicit supported simulation flow.
Do not assume that a timed-out request failed or blindly create another payment.

You control your hosting, return destinations and webhook receiver. Configure
HTTPS and exact authorized URLs. Do not place personal information or secrets
in order references or URLs. Public checkout links should be shared only with
the intended recipient because possession may reveal checkout status.

### 5. Acceptable use

Do not attempt unauthorized account access, bypass authentication or quotas,
exploit other tenants, impersonate people, distribute malware, commit fraud,
misrepresent test receipts, or disrupt the service. Do not run load tests,
denial-of-service tests or intrusive security scans without written permission.
Report suspected vulnerabilities privately to the contact above.

You are responsible for having authority to submit data and for your own
application's legal compliance. Use synthetic test data wherever possible.

### 6. Your content and our materials

You retain rights to data and code you provide. You grant us a limited right
to process submitted data as needed to operate, secure and support the service.
This does not transfer ownership of your application.

Our branding and service materials remain protected by applicable intellectual
property rights. Downloaded starter code and third-party components remain
subject to their stated licenses. These terms do not override open-source
licenses or authorize claims that your application is endorsed by us.

### 7. Fees

This draft does not authorize an application fee, subscription, automatic charge
or real-funds transaction. Any future paid plan must disclose its price,
billing basis, taxes, cancellation and refund terms before separate acceptance.
Sandbox credit cannot be used to pay fees or withdrawn.

### 8. Availability, suspension and closure

The Sandbox is a development service and may change, be interrupted or become
unavailable. There is no service-level guarantee unless separately agreed.

We may restrict or suspend access to address abuse, security risks, legal
requirements or material breaches. Where practical, we will explain the reason
and available next steps without compromising security or legal obligations.
You may stop using the service and request account closure through the contact
above. Closing access does not imply immediate erasure of all records; see
retention and rights below.

### 9. Disclaimers and liability — legal review required

To the extent permitted by applicable law, the Sandbox is provided as available,
without a guarantee that it is uninterrupted, error-free or suitable for
production use. It is not financial, tax or legal advice.

Nothing in these terms excludes rights or liabilities that cannot lawfully be
excluded, including mandatory consumer or privacy protections. Any additional
liability cap or exclusion must be reviewed for the operator's jurisdiction and
explicitly included in the final agreement; none is invented in this draft.

### 10. Changes and disputes

**Proposed notice policy:** publish material changes with at least 15 days'
notice where practicable, except urgent security or legal changes. Obtain renewed
acceptance when required. The operator must confirm a workable notice process
before adopting this policy.

Contact support@mainvaultwallet.com to raise an issue. Governing law, operator
address and dispute venue must be completed before this document is finalized.
This draft does not impose arbitration or waive mandatory statutory rights.

## Part B — Privacy Notice

### 1. Who is responsible

MainVault Wallet is the service name supplied by the owner. The responsible
legal person, address, operating country and applicable privacy law must be
confirmed before publication. Privacy contact: support@mainvaultwallet.com.

### 2. Information processed

Depending on the features used, the service processes:

- Name, email, verification state, terms version accepted and account status.
- Passkey public credentials and authentication metadata; login/API key
  verifiers, session records and security/audit events. Passkey authentication
  does not require us to receive your device's fingerprint or face image.
- Sandbox balances, test order references, amounts, assigned identifiers,
  review/approval state, receipts, checkout status and idempotency records.
- Configured return/webhook URLs, webhook delivery status, retry information
  and protected webhook signing material.
- Technical request information needed for service operation and abuse controls,
  potentially including IP address, request timing and hosting/security logs.
- Information you voluntarily send when requesting support.

Do not include real customer financial data or sensitive information in test
records. Public checkout status is accessible through its opaque link; do not
assume a link is private merely because it is not listed publicly.

### 3. Purposes and legal bases

We use information to verify accounts, authenticate users, operate test APIs,
deliver verification/security messages, process simulated orders, reconcile
events, provide support, investigate abuse and meet applicable legal obligations.

The final notice must identify the legal bases required by the applicable law,
such as performance of a contract, legitimate interests, legal obligations or
consent where appropriate. We do not assert that one blanket consent covers
all processing. No advertising or analytics consent is created by accepting
these terms.

### 4. Cookies and browser storage

Necessary cookies support authenticated sessions and request protection.
Temporary browser state may support navigation, the introduction experience
and forms. The current application does not implement optional advertising or
analytics cookies. Verify the actual hosted site and third-party resources
before publishing this statement.

Browser privacy settings may affect authentication. Essential cookies do not
authorize unrelated tracking.

### 5. Recipients and external services — deployment confirmation required

The following is a source/project-informed inventory, not a verified final
processor list:

- **Cloudflare:** configured infrastructure may include DNS/proxy protection,
  D1 metadata, encrypted R2 backups and email delivery. Confirm active bindings,
  actual email product, retained fields and processing locations.
- **AWS-hosted server running Coolify:** application hosting described for this
  project. Coolify is the management software, not a separate cloud custodian.
  Confirm the account, region and backup/log handling.
- **Google Fonts:** the web page requests fonts from Google-hosted resources.
  Those requests can disclose technical connection information such as IP and
  browser headers. Confirm this is intended or self-host the fonts.
- **Market-data provider:** current source defaults to Coinbase public prices,
  with an optional Cloudflare Worker provider. Server-side quote requests do
  not require sending the developer's name or email. Confirm the active mode.
- **Your configured webhook/return destination:** receives the event payload
  or browser navigation necessary for your integration. You control that
  destination and its separate privacy obligations.
- **Development tooling:** Replit is used for development and preview. Do not
  use real customer data in disposable test environments. Confirm any actual
  production-data access before listing it as a production processor.

Disclosures may also be necessary to comply with law or protect against abuse,
subject to applicable safeguards. Confirm the full list of processors and any
cross-border transfer safeguards before launch; this draft promises no specific
data-residency region.

### 6. Security

The application uses access controls, separated developer/owner authorization,
credential verifiers and protected signing material. These measures reduce
risk but cannot guarantee absolute security. Do not email secrets to support.
Actual hosted TLS, backup protection and recovery procedures need verification;
this notice is not a certification that every deployment has passed those checks.

### 7. Retention

Session and verification expiration do not mean account data is deleted.
Account, test transaction, audit, webhook, backup and idempotency records may
have different retention needs. Certain replay-prevention records must survive
ordinary transaction archival.

Before publication, the operator must approve and disclose retention periods
or sufficiently specific criteria for each category, including deletion from
backups and security records. No blanket immediate-deletion guarantee is made.
This unresolved retention schedule is a publication blocker.

### 8. Your requests and rights

Contact support@mainvaultwallet.com to request access, correction, export,
closure or deletion, or raise a privacy concern. We may need to verify your
identity without asking for your secret keys. Applicable law may also provide
rights to object, restrict processing, withdraw consent or complain to a
supervisory authority.

Some records may need retention for legal obligations, security or dispute
resolution. Explain any applicable restriction when responding. The operator
must confirm request handling and applicable statutory deadlines before launch.

### 9. Children

Under the proposed 18+ rule, the service is not intended for children. Report a
suspected underage account to the privacy contact so the operator can investigate
and take appropriate action under applicable law.

### 10. Notice changes

Publish the effective date and version of this notice. Explain material changes
through a visible notice or account communication as appropriate, and obtain
consent where required. No effective date is assigned to this draft.

## Drafting attribution

The service-access, account-security, permitted-use, suspension and service-
availability structure is adapted from Common Paper's Cloud Service Agreement:
https://github.com/CommonPaper/CSA/blob/main/CSA.md .
Common Paper makes its standard agreements available under CC BY 4.0:
https://creativecommons.org/licenses/by/4.0/ .
This shortened, modified Sandbox draft is not Common Paper's unmodified
agreement and is not endorsed by Common Paper. The project-specific privacy
notice and technical disclosures are additions requiring operator verification.

## Configuration handoff — not part of the customer agreement

The public Sandbox usage agreement is now bundled in
`artifacts/api-server/src/developers/terms.ts`. It is a shorter agreement,
not this full legal-review document. The old terms environment variables are
ignored. The owner authorized registration to be independent of draft status;
no final legal approval is implied.

1. Update bundled text and version together when a replacement is approved.
2. No terms variables are needed. Sandbox registration is open by default.
   Optional `DEVELOPER_REGISTRATION_ENABLED=false` pauses new registration/resends.
3. Deploy the website frontend/backend after authorization, not Core or Signet.
4. Confirm `/api/developers/session` serves the bundled version and text.
   Draft status remains `approved: false`; it no longer closes registration.
5. Verify agreement acceptance and registration in the hosted environment with
   an authorized disposable account. Finish the publication checklist before
   presenting the longer legal document as final.
