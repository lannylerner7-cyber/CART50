import { changeState, readState } from "./store";
import { securityState } from "./login-security";
import { logger } from "../lib/logger";

let running = false;
export async function deliverSecurityAlert(send: typeof fetch = fetch) {
  if (running) return;
  running = true;
  try {
    const pending = securityState(await readState()).pending;
    if (!pending) return;
    if (Date.now() - pending.at >= 23 * 3600000) {
      // Bound sensitive IP retention and avoid replay after provider idempotency expiry.
      await changeState(s => { if (s.loginSecurity?.pending?.id === pending.id) delete s.loginSecurity.pending; });
      logger.warn("Expired undelivered login alert; verify security email configuration");
      return;
    }
    if (!process.env.RESEND_API_KEY || !process.env.SECURITY_ALERT_FROM || !process.env.SECURITY_ALERT_TO) {
      throw new Error("Security email not configured");
    }
    const response = await send("https://api.resend.com/emails", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json",
        "User-Agent": "PersonalVault", "Idempotency-Key": `vault-login-${pending.id}` },
      body: JSON.stringify({
        from: process.env.SECURITY_ALERT_FROM, to: [process.env.SECURITY_ALERT_TO],
        subject: "Vault security: invalid access key",
        text: `An invalid vault key was submitted at ${new Date(pending.at).toISOString()}.\nObserved client IP: ${pending.ip}\nThis IP may belong to a VPN or proxy; it does not identify a person.\nThree invalid keys trigger a one-hour cooldown. Alerts are limited to one per 15 minutes; this is not a complete event log.\nNo submitted key, cookie or wallet data is included.`,
      }),
    });
    if (!response.ok) throw new Error("Security email provider rejected delivery");
    const result = await response.json() as { id?: string };
    if (!result.id) throw new Error("Security email provider acknowledgement missing");
    await changeState(s => { if (s.loginSecurity?.pending?.id === pending.id) delete s.loginSecurity.pending; });
  } catch {
    logger.warn("Security email not delivered; alert retained for retry. Check email configuration/provider.");
  } finally { running = false; }
}
export function startSecurityMail() {
  void deliverSecurityAlert();
  setInterval(() => { void deliverSecurityAlert(); }, 60000).unref();
}
