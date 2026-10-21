import test from "node:test";
import assert from "node:assert/strict";

import { registerSchema } from "../modules/users/user.validation.js";

test("accepts a valid email registration and normalizes email", () => {
  const result = registerSchema.safeParse({
    name: "  Vamshi  ",
    email: "VAMSHI@example.com",
    password: "Cricket@2026"
  });

  assert.equal(result.success, true);
  assert.equal(result.data.name, "Vamshi");
  assert.equal(result.data.email, "vamshi@example.com");
});

test("accepts a valid phone registration", () => {
  const result = registerSchema.safeParse({
    name: "Vamshi",
    phone: "+919876543210",
    password: "Cricket@2026"
  });

  assert.equal(result.success, true);
});

test("rejects registration without email or phone", () => {
  const result = registerSchema.safeParse({
    name: "Vamshi",
    password: "Cricket@2026"
  });

  assert.equal(result.success, false);
});

test("rejects an invalid email", () => {
  const result = registerSchema.safeParse({
    name: "Vamshi",
    email: "not-an-email",
    password: "Cricket@2026"
  });

  assert.equal(result.success, false);
});

test("rejects an invalid phone number", () => {
  const result = registerSchema.safeParse({
    name: "Vamshi",
    phone: "9876543210",
    password: "Cricket@2026"
  });

  assert.equal(result.success, false);
});

test("rejects a short password", () => {
  const result = registerSchema.safeParse({
    name: "Vamshi",
    email: "vamshi@example.com",
    password: "Short1!"
  });

  assert.equal(result.success, false);
});

test("rejects unexpected fields", () => {
  const result = registerSchema.safeParse({
    name: "Vamshi",
    email: "vamshi@example.com",
    password: "Cricket@2026",
    role: "admin"
  });

  assert.equal(result.success, false);
});