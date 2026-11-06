import { test } from "node:test";
import assert from "node:assert/strict";
import { developerTerms, DEVELOPER_TERMS_VERSION } from "./terms";

test("production Sandbox registration needs no terms environment variables", () => {
  const terms = developerTerms({ NODE_ENV: "production" });
  assert.equal(terms.signupEnabled, true);
  assert.equal(terms.approved, false);
  assert.equal(terms.version, DEVELOPER_TERMS_VERSION);
  assert.match(terms.text, /Privacy and necessary cookies/);
});
test("old terms variables cannot replace shipped content or assert approval", () => {
  assert.deepEqual(developerTerms({ DEVELOPER_TERMS_VERSION: "old", DEVELOPER_TERMS_TEXT: "old" }), developerTerms({}));
});
test("independent registration switch closes safely", () => {
  for (const value of ["false", "", "TRUE", "invalid"]) {
    assert.equal(developerTerms({ DEVELOPER_REGISTRATION_ENABLED: value }).signupEnabled, false);
  }
  assert.equal(developerTerms({ DEVELOPER_REGISTRATION_ENABLED: "true" }).signupEnabled, true);
});
