import app from "./app";
import { logger } from "./lib/logger";
import { startMarketPolling } from "./vault/market";
import { startSecurityMail } from "./vault/security-mail";
import { initializeMetadata } from "./vault/store";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Do not accept traffic or start background jobs until the schema is ready.
initializeMetadata().then(() => app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startMarketPolling();
  startSecurityMail();
})).catch(err => {
  logger.error({ err }, "Metadata schema initialization failed; server not started");
  process.exit(1);
});
