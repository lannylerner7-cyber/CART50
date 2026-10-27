import { Router } from "express";
import * as Z from "@workspace/api-zod";
import { changeState, readState } from "../vault/store";
import { HttpError } from "../vault/auth";
import {
  createSimulationReview, executeSimulation, newSandboxLedger, publicReview,
  SandboxError, SIMULATION_DESTINATION,
} from "../vault/sandbox-ledger";

// Mounted AFTER the vault's owner, origin and CSRF middleware.
export const sandboxRouter = Router();
sandboxRouter.get("/address", async (req, res) => {
  const { destination } = Z.GetSandboxAddressQueryParams.parse(req.query);
  if (destination !== SIMULATION_DESTINATION) throw new HttpError(400, "Only the assigned simulation identifier can be checked. No external Bitcoin address is queried.");
  const ledger = (await readState()).sandbox ?? newSandboxLedger();
  res.json(Z.GetSandboxAddressResponse.parse({
    destination, environment: "simulation", simulatedCreditCents: ledger.simulatedCreditCents,
    transactionCount: ledger.transactions.length,
    transactions: ledger.transactions.slice(0, 10), checkedAt: new Date().toISOString(),
  }));
});
sandboxRouter.get("/", async (_req, res) => {
  const state = await readState();
  const ledger = state.sandbox ?? newSandboxLedger();
  res.json(Z.GetSandboxResponse.parse({
    environment: "sandbox",
    simulatedCreditCents: ledger.simulatedCreditCents,
    assignedAddress: SIMULATION_DESTINATION,
    signetAvailable: false,
    message: "Simulation only. This identifier is not a Bitcoin address. Actual Signet funding and transfers require separate commissioning; no live node is used.",
    transactions: ledger.transactions,
    reviews: ledger.reviews.filter(r => r.sessionHash === res.locals.session.hash).map(publicReview),
  }));
});
sandboxRouter.post("/reviews", async (req, res) => {
  const body = Z.ReviewSandboxPaymentBody.parse(req.body);
  const review = await changeState(state => {
    state.sandbox ??= newSandboxLedger();
    return createSimulationReview(state.sandbox, body.amountCents, body.destination, res.locals.session.hash);
  });
  res.json(Z.ReviewSandboxPaymentResponse.parse(publicReview(review)));
});
sandboxRouter.post("/payments", async (req, res) => {
  const body = Z.ExecuteSandboxPaymentBody.parse(req.body);
  const receipt = await changeState(state => {
    state.sandbox ??= newSandboxLedger();
    return executeSimulation(state.sandbox, body.reviewId, body.confirmed, res.locals.session.hash);
  });
  res.json(Z.ExecuteSandboxPaymentResponse.parse(receipt));
});
sandboxRouter.use((error: unknown, _req: import("express").Request, _res: import("express").Response, next: import("express").NextFunction) => {
  next(error instanceof SandboxError ? new HttpError(error.status, error.message) : error);
});
