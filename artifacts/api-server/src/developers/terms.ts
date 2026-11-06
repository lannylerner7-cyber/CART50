// Public, versioned content shipped with the application, not a secret.
// Update the version whenever the agreement changes.
export const DEVELOPER_TERMS_VERSION = "sandbox-draft-2";
export const DEVELOPER_TERMS_TEXT = `MainVault Wallet — Developer Sandbox agreement

Draft notice: this agreement describes Sandbox use. Final legal terms and jurisdiction-specific privacy disclosures remain under review. It does not authorize Live financial services.

1. Sandbox access
Use the Sandbox to develop and test integrations. Balances, credits, transactions and receipts are simulated, have no monetary value and cannot be withdrawn. Do not use simulated confirmations to fulfil real orders. Live access requires separate authorization and readiness checks.

2. Accounts and security
Provide a name and an email you control. Complete email verification and passkey enrollment. Protect your login key, API keys and webhook secrets. Never put server keys in browser code, public repositories or support messages. Developer credentials do not grant access to the personal owner vault.

3. Integration responsibilities
Follow documented API limits and idempotency rules. Verify webhook signatures and timestamps, match order identifiers and amounts, and safely handle repeated events. A browser redirect or "I've sent" button is not proof of payment. Use the explicit simulation flow for test completion.

4. Acceptable use
Do not access other accounts, bypass security or quotas, commit fraud, misrepresent receipts, or disrupt the service. Obtain permission before load tests or intrusive security testing. Use synthetic test data and do not submit wallet private keys or seed phrases.

5. Privacy and necessary cookies
We process your name, email, verification state, accepted agreement version, passkey public credentials, credential verifiers and session/security records to provide and protect access. Sandbox records include test orders, reviews, receipts and configured webhook/return URLs. Necessary cookies support authentication and request protection; optional advertising or analytics cookies are not implemented.

Hosting, database, email and security providers may process information needed to operate the service. External font requests may disclose technical connection information. Your configured webhook endpoint receives relevant test events. Avoid personal or confidential information in order references and public checkout links.

Session expiry does not delete account or transaction records. Retention periods, processor disclosures and jurisdiction-specific privacy requirements remain under review. Contact support@mainvaultwallet.com for access, correction, deletion, account closure or security concerns. Do not include secret credentials in requests.

6. Availability and access controls
Sandbox availability is not guaranteed. Access may be restricted for security, abuse, capacity or legal reasons. No application fee, subscription or Live transfer is authorized by accepting this agreement. Any paid or Live service requires separate disclosed terms.

7. Scope of acceptance
By checking the agreement box and continuing registration, you acknowledge this draft status and agree to these Sandbox usage rules. This is not consent to unrelated marketing and does not waive rights under applicable law.

MainVault Wallet contact: support@mainvaultwallet.com`;

export function developerTerms(env: NodeJS.ProcessEnv = process.env) {
  return {
    version: DEVELOPER_TERMS_VERSION,
    text: DEVELOPER_TERMS_TEXT,
    approved: false,
    // Registration availability is independent of legal publication status.
    // Unset means open for Sandbox; an explicit non-true value closes it.
    signupEnabled: env.DEVELOPER_REGISTRATION_ENABLED === undefined ||
      env.DEVELOPER_REGISTRATION_ENABLED === "true",
  };
}
