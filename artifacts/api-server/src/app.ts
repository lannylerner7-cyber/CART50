import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import vault from "./routes/vault";
import { HttpError } from "./vault/auth";
import { ZodError } from "zod";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.startsWith("/api/vault/") ? "/api/vault/[redacted]" : req.url?.split("?")[0],
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
app.use(express.json({ limit: "64kb" }));

app.use("/api/vault", vault);
app.use("/api", router);
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return; }
  if (err instanceof ZodError || err instanceof SyntaxError) { res.status(400).json({ error: "Invalid request data" }); return; }
  req.log.error("Vault request failed; sensitive error details suppressed");
  res.status(503).json({ error: "Service unavailable. No operation was confirmed; check connection and retry safely." });
});

export default app;
