import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";
import { mailAddresses, smtpOptions } from "./vault/smtp";

// Operator-only CLI: never exposed as an unauthenticated HTTP endpoint.
// Defaults to a local configuration check. Network access requires an explicit flag.
async function main() {
  const mode = process.argv[2] ?? "--check-config";
  if (process.argv.length > 3 || !["--check-config", "--verify", "--send-test"].includes(mode)) {
    throw new Error("USAGE");
  }
  const options = smtpOptions();
  const { from, to } = mailAddresses();
  console.log("PASS: SMTP configuration; implicit TLS and certificate verification required.");
  if (mode === "--check-config") return;
  const transport = nodemailer.createTransport(options);
  try {
    await transport.verify();
    console.log("PASS: SMTP connection, TLS and authentication.");
    if (mode === "--send-test") {
      const id = randomUUID();
      const result = await transport.sendMail({
        from, to,
        messageId: `<vault-smtp-test-${id}@${from.split("@")[1]}>`,
        subject: "Vault SMTP setup test",
        text: "This is a requested test of the vault's security email configuration, not a login alert.\nNo wallet data, access keys or SMTP credentials are included.\nConfirm receipt with the operator.",
      });
      if (result.accepted.length !== 1 || result.rejected.length || !/^250(?:[ -])/.test(result.response)) {
        throw new Error("SUBMISSION");
      }
      console.log("PASS: test email accepted by SMTP. Confirm inbox receipt and Cloudflare delivery logs.");
    }
  } finally { transport.close(); }
}
main().catch(error => {
  // Do not print transport errors: they can contain SMTP dialogue or credentials.
  const code = typeof error?.code === "string" ? error.code : "";
  const hints: Record<string, string> = {
    EAUTH: "SMTP authentication failed. Check token permissions and account.",
    ECONNECTION: "SMTP connection failed. Check outbound port 465.",
    ECONNREFUSED: "SMTP connection refused. Check outbound port 465.",
    ETIMEDOUT: "SMTP timed out. Check outbound port 465.",
    EDNS: "SMTP hostname could not be resolved.",
    ESOCKET: "SMTP socket/TLS failed. Do not disable certificate verification.",
    EENVELOPE: "SMTP sender or recipient rejected. Check sending-domain onboarding.",
    EMESSAGE: "SMTP rejected the test message.",
  };
  console.error("FAIL: " + (hints[code] ?? "Check SMTP variables, TLS, sender onboarding and provider logs. No diagnostic secrets printed."));
  console.error("Usage: node /app/dist/smtp-check.mjs [--check-config|--verify|--send-test]");
  process.exitCode = 1;
});
