import nodemailer from "nodemailer";

export type SecurityMessage = {
  from: string; to: string; subject: string; text: string; messageId: string; date: Date;
};
export type SmtpReceipt = { accepted: unknown[]; rejected: unknown[]; response: string };
export type SecuritySender = (message: SecurityMessage) => Promise<SmtpReceipt>;

// Cloudflare SMTP submission is implicit TLS only. Never permit downgrade,
// unverified certificates, arbitrary token destinations, or transport debug logs.
export function smtpOptions(env: NodeJS.ProcessEnv = process.env) {
  const host = env.SMTP_HOST || "smtp.mx.cloudflare.net";
  const port = Number(env.SMTP_PORT || "465");
  const user = env.SMTP_USER || "api_token";
  if (host !== "smtp.mx.cloudflare.net" || port !== 465 || user !== "api_token") {
    throw new Error("Cloudflare SMTP requires its documented host, port 465 and api_token username");
  }
  if (!env.SMTP_PASSWORD?.trim()) throw new Error("SMTP_PASSWORD is required");
  return {
    host, port, secure: true,
    auth: { user, pass: env.SMTP_PASSWORD },
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" as const, servername: host },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    logger: false, debug: false,
    disableFileAccess: true, disableUrlAccess: true,
  };
}
export function mailAddresses(env: NodeJS.ProcessEnv = process.env) {
  const from = env.SECURITY_ALERT_FROM ?? "", to = env.SECURITY_ALERT_TO ?? "";
  const bareEmail = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
  if (![from, to].every(x => x.length <= 254 && bareEmail.test(x))) {
    throw new Error("SECURITY_ALERT_FROM and SECURITY_ALERT_TO must be single email addresses");
  }
  return { from, to };
}
export const sendSecurityMail: SecuritySender = async message => {
  const transport = nodemailer.createTransport(smtpOptions());
  try { return await transport.sendMail(message); }
  finally { transport.close(); }
};
