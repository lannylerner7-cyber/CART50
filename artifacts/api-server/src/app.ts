import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import vault from "./routes/vault";
import { HttpError } from "./vault/auth";
import { ZodError } from "zod";
import { mountDashboard } from "./static";
import { configureTrustedProxies } from "./vault/login-security";
import { admission } from "./middlewares/admission";
import { configuredNetwork } from "./vault/network";
import { developerRouter } from "./developers/routes";
import { checkoutRouter } from "./developers/checkout-routes";
import {developerLimits} from "./developers/limits";
import {requestBody, requestBodyErrors} from "./middlewares/request-body";
import { platformAdminRouter } from "./platform-admin/auth";

const app: Express = express();
configuredNetwork();
configureTrustedProxies(app);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: /^(\/api\/(vault|platform-admin|developers|developer-console|admin|checkout|v1)(\/|$)|\/checkout\/)/.test(req.url ?? "") ? "/[private]" : req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  next();
});
app.use("/api/vault", admission());
// Separate from owner admission so public traffic cannot consume owner slots.
app.use(["/api/developers", "/api/developer-console", "/api/checkout", "/api/v1", "/api/developer-wallet"], admission());
app.use(requestBody);
app.use(requestBodyErrors);
app.use("/api/platform-admin", admission(), platformAdminRouter);

app.use("/api/vault", vault);
app.use("/api", developerLimits);
app.use("/api/developers", developerRouter());
app.use("/api", checkoutRouter);
app.use("/api", router);
mountDashboard(app, process.env.VAULT_STATIC_DIR);
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return; }
  if (err instanceof ZodError || err instanceof SyntaxError) { res.status(400).json({ error: "Invalid request data" }); return; }
  req.log.error("Vault request failed; sensitive error details suppressed");
  res.status(503).json({ error: "Service unavailable. No operation was confirmed; check connection and retry safely." });
});

export default app;
