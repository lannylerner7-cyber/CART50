// Only fixed categories cross the storage/API boundary, never provider text.
export type MailError = "configuration" | "authentication" | "connection" | "timeout" | "tls" | "rejected" | "provider" | "unknown";
export type MailDiagnostic = {
  correlationId: string;
  attemptedAt: string;
  completedAt: string | null;
  status: "pending" | "sent" | "failed";
  error: MailError | null;
};
export function classifyMailError(error: unknown): MailError {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  switch (code) {
    case "EAUTH": return "authentication";
    case "ETIMEDOUT": return "timeout";
    case "ECONNECTION": case "ECONNREFUSED": case "ECONNRESET": case "EDNS": case "ENOTFOUND": return "connection";
    case "ETLS": case "CERT_HAS_EXPIRED": case "DEPTH_ZERO_SELF_SIGNED_CERT": case "ERR_TLS_CERT_ALTNAME_INVALID": return "tls";
    case "EENVELOPE": return "rejected";
    case "EMESSAGE": case "ESMTP": return "provider";
    default: return "unknown";
  }
}
