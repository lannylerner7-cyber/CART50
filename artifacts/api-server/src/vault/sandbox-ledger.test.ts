import { test } from "node:test";
import assert from "node:assert/strict";
import { createSimulationReview, executeSimulation, newSandboxLedger, publicReview, SIMULATION_DESTINATION } from "./sandbox-ledger";

test("simulation debit and replay use exactly one durable receipt", () => {
  const ledger = newSandboxLedger();
  const review = createSimulationReview(ledger, 2500, SIMULATION_DESTINATION, "session", 1000);
  const receipt = executeSimulation(ledger, review.id, true, "session", 2000);
  assert.equal(ledger.simulatedCreditCents, 297500);
  assert.deepEqual(executeSimulation(ledger, review.id, true, "session", 999999), receipt);
  assert.equal(ledger.transactions.length, 1);
  assert.equal(ledger.simulatedCreditCents, 297500);
  assert.equal("sessionHash" in publicReview(review), false);
});
test("invalid amounts and other destinations are rejected", () => {
  for (const amount of [0, -1, 0.5, Infinity, NaN, 300001]) {
    assert.throws(() => createSimulationReview(newSandboxLedger(), amount, SIMULATION_DESTINATION, "s"));
  }
  for (const dest of ["bc1qfake", "tb1qfake", "", `${SIMULATION_DESTINATION} `]) {
    assert.throws(() => createSimulationReview(newSandboxLedger(), 100, dest, "s"));
  }
});
test("approval, session and review expiry are enforced on server", () => {
  const ledger = newSandboxLedger();
  const review = createSimulationReview(ledger, 100, SIMULATION_DESTINATION, "session", 1000);
  assert.throws(() => executeSimulation(ledger, review.id, false, "session", 2000), /approval/);
  assert.throws(() => executeSimulation(ledger, review.id, true, "other", 2000), /previous session/);
  assert.throws(() => executeSimulation(ledger, review.id, true, "session", 301000), /expired/);
  assert.equal(ledger.simulatedCreditCents, 300000);
});
test("competing reviews cannot overdraw credit", () => {
  const ledger = newSandboxLedger();
  const first = createSimulationReview(ledger, 250000, SIMULATION_DESTINATION, "s", 1000);
  const second = createSimulationReview(ledger, 250000, SIMULATION_DESTINATION, "s", 1000);
  executeSimulation(ledger, first.id, true, "s", 2000);
  assert.throws(() => executeSimulation(ledger, second.id, true, "s", 2000), /credit changed/);
  assert.equal(ledger.simulatedCreditCents, 50000);
});
test("review growth is bounded without losing completed receipts", () => {
  const ledger = newSandboxLedger();
  for (let i = 0; i < 50; i++) createSimulationReview(ledger, 1, SIMULATION_DESTINATION, "s", 1000);
  assert.throws(() => createSimulationReview(ledger, 1, SIMULATION_DESTINATION, "s", 1000), /Too many/);
  createSimulationReview(ledger, 1, SIMULATION_DESTINATION, "s", 301000);
  assert.equal(ledger.reviews.length, 1);
});
