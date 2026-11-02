import test from "node:test";
import assert from "node:assert/strict";

import { updateProfileSchema } from "../modules/users/profile.validation.js";

test("accepts a valid name and trims whitespace", () => {
  const result = updateProfileSchema.safeParse({
    name: "  Vamshi  ",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.name, "Vamshi");
});

test("rejects a name shorter than 2 characters", () => {
  const result = updateProfileSchema.safeParse({
    name: "V",
  });

  assert.equal(result.success, false);
});

test("rejects a name longer than 100 characters", () => {
  const result = updateProfileSchema.safeParse({
    name: "A".repeat(101),
  });

  assert.equal(result.success, false);
});

test("rejects a missing name", () => {
  const result = updateProfileSchema.safeParse({});

  assert.equal(result.success, false);
});

test("rejects unexpected protected fields", () => {
  const result = updateProfileSchema.safeParse({
    name: "Vamshi",
    role: "admin",
    emailVerified: true,
  });

  assert.equal(result.success, false);
});