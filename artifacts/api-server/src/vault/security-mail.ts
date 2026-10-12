import { changeState, readState } from "./store";
import { securityState } from "./login-security";
import { logger } from "../lib/logger";
import { mailAddresses, sendSecurityMail, type SecuritySender } from "./smtp";

let running = false;
export async function deliverSecurityAlert(send: SecuritySender = sendSecurityMail) {
  if (running) return;
  running = true;
  try {
    const pending = securityState(await readState()).pending;
    if (!pending) return;
    if (Date.now() - pending.at >= 23 * 3600000) {
      // Bound sensitive IP retention and retry lifetime.
      await changeState(s => { if (s.loginSecurity?.pending?.id === pending.id) delete s.loginSecurity.pending; });
      logger.warn("Expired undelivered login alert; verify security email configuration");
      return;
    }
    const { from, to } = mailAddresses();
    const result = await send({
        from, to,
        messageId: `<vault-login-${pending.id}@${from.split("@")[1]}>`,
        date: new Date(pending.at),
        subject: "Vault security: invalid access key",
        text: `An invalid vault key was submitted at ${new Date(pending.at).toISOString()}.\nObserved client IP: ${pending.ip}\nThis IP may belong to a VPN or proxy; it does not identify a person.\nThree invalid keys trigger a one-hour cooldown. Alerts are limited to one per 15 minutes; this is not a complete event log.\nNo submitted key, cookie or wallet data is included.`,
    });
    if (result.accepted.length !== 1 || result.rejected.length || !/^250(?:[ -])/.test(result.response)) {
      throw new Error("SMTP submission acknowledgement missing");
    }
    await changeState(s => { if (s.loginSecurity?.pending?.id === pending.id) delete s.loginSecurity.pending; });
  } catch {
    logger.warn("Security email not delivered; alert retained for retry. Check email configuration/provider.");
  } finally { running = false; }
}
export function startSecurityMail() {
  void deliverSecurityAlert();
  setInterval(() => { void deliverSecurityAlert(); }, 60000).unref();
}
