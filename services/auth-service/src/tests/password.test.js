import test from "node:test";
import assert from "node:assert/strict";

import {
  hashPassword,
  verifyPassword
} from "../utils/password.js";

test("hashPassword returns a hash instead of the original password", async () => {
  const password = "Cricket@2026";
  const passwordHash = await hashPassword(password);

  assert.notEqual(passwordHash, password);
  assert.ok(passwordHash.startsWith("$2b$"));
});

test("verifyPassword accepts the correct password", async () => {
  const password = "Cricket@2026";
  const passwordHash = await hashPassword(password);

  assert.equal(await verifyPassword(password, passwordHash), true);
});

test("verifyPassword rejects an incorrect password", async () => {
  const passwordHash = await hashPassword("Cricket@2026");

  assert.equal(await verifyPassword("WrongPassword@2026", passwordHash), false);
});

test("hashPassword rejects passwords shorter than 8 characters", async () => {
  await assert.rejects(
    hashPassword("Short1!"),
    /at least 8 characters/
  );
});

test("verifyPassword safely rejects invalid input", async () => {
  assert.equal(await verifyPassword(null, "some-hash"), false);
});