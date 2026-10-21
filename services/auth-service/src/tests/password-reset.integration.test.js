
import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongoServer;
let User;
let resetPassword;
let resetPasswordWithPhone;
let createAccessToken;
let requireAuth;

const TEST_PASSWORD = "TestPassword123!";
const RESET_PASSWORD = "NewPassword456!";

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.FRONTEND_ORIGIN = "http://localhost:5173";
  process.env.MSG91_AUTH_KEY = "test-msg91-key";
  process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
  process.env.JWT_SECRET = "test-only-secret-key-at-least-32-characters";
  process.env.JWT_EXPIRES_IN = "15m";

  mongoServer = await MongoMemoryServer.create();

  process.env.MONGODB_URI = mongoServer.getUri();

  await mongoose.connect(mongoServer.getUri(), {
    serverSelectionTimeoutMS: 5000,
  });

  // Import after setting the environment variables.
  ({ User } = await import("../modules/users/user.model.js"));
  ({ resetPassword } = await import(
    "../modules/users/password-reset.service.js"
  ));
  ({ resetPasswordWithPhone } = await import(
    "../modules/users/phone-password-reset.service.js"
  ));
  ({ createAccessToken } = await import("../utils/jwt.js"));
  ({ requireAuth } = await import("../middleware/require-auth.js"));
});

after(async () => {
  await mongoose.disconnect();

  if (mongoServer) {
    await mongoServer.stop();
  }
});

beforeEach(async () => {
  await User.deleteMany({});
});

async function createEmailResetUser() {
  const { createHash } = await import("node:crypto");
  const { hashPassword } = await import("../utils/password.js");

  const rawToken = "a".repeat(64);
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  const user = await User.create({
    name: "Email Test User",
    email: "email-test@example.com",
    emailVerified: true,
    status: "active",
    role: "user",
    sessionVersion: 0,
    passwordHash: await hashPassword(TEST_PASSWORD),
    passwordReset: {
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  return { user, rawToken };
}

async function createPhoneResetUser() {
  const { createHash } = await import("node:crypto");
  const { hashPassword } = await import("../utils/password.js");

  const rawToken = "b".repeat(64);
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  const user = await User.create({
    name: "Phone Test User",
    phone: "+919876543210",
    phoneVerified: true,
    status: "active",
    role: "user",
    sessionVersion: 0,
    passwordHash: await hashPassword(TEST_PASSWORD),
    phonePasswordReset: {
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  return { user, rawToken };
}

function mockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

test("email reset changes password and increments sessionVersion", async () => {
  const { user, rawToken } = await createEmailResetUser();

  const result = await resetPassword(rawToken, RESET_PASSWORD);
  const updated = await User.findById(user._id).select("+passwordHash");

  assert.equal(result.message, "Password reset successfully. You can now sign in.");
  assert.equal(updated.sessionVersion, 1);
  assert.equal(updated.passwordReset?.tokenHash, undefined);
  assert.equal(
    await (await import("../utils/password.js")).verifyPassword(
      RESET_PASSWORD,
      updated.passwordHash
    ),
    true
  );
});

test("email reset token cannot be reused", async () => {
  const { rawToken } = await createEmailResetUser();

  await resetPassword(rawToken, RESET_PASSWORD);

  await assert.rejects(
    resetPassword(rawToken, "AnotherPassword789!"),
    { statusCode: 400 }
  );
});

test("expired email reset token is rejected", async () => {
  const { user, rawToken } = await createEmailResetUser();

  await User.updateOne(
    { _id: user._id },
    { $set: { "passwordReset.expiresAt": new Date(Date.now() - 1000) } }
  );

  await assert.rejects(
    resetPassword(rawToken, RESET_PASSWORD),
    { statusCode: 400 }
  );
});

test("phone reset changes password and increments sessionVersion", async () => {
  const { user, rawToken } = await createPhoneResetUser();

  const result = await resetPasswordWithPhone({
    recoveryToken: rawToken,
    password: RESET_PASSWORD,
  });

  const updated = await User.findById(user._id).select("+passwordHash");

  assert.equal(result.message, "Password reset successfully.");
  assert.equal(updated.sessionVersion, 1);
  assert.equal(updated.phonePasswordReset?.tokenHash, undefined);
  assert.equal(
    await (await import("../utils/password.js")).verifyPassword(
      RESET_PASSWORD,
      updated.passwordHash
    ),
    true
  );
});

test("phone reset token cannot be reused", async () => {
  const { rawToken } = await createPhoneResetUser();

  await resetPasswordWithPhone({
    recoveryToken: rawToken,
    password: RESET_PASSWORD,
  });

  await assert.rejects(
    resetPasswordWithPhone({
      recoveryToken: rawToken,
      password: "AnotherPassword789!",
    }),
    { statusCode: 400 }
  );
});

test("expired phone reset token is rejected", async () => {
  const { user, rawToken } = await createPhoneResetUser();

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        "phonePasswordReset.expiresAt": new Date(Date.now() - 1000),
      },
    }
  );

  await assert.rejects(
    resetPasswordWithPhone({
      recoveryToken: rawToken,
      password: RESET_PASSWORD,
    }),
    { statusCode: 400 }
  );
});

test("old JWT is rejected after sessionVersion changes", async () => {
  const user = await User.create({
    name: "Session Test User",
    email: "session-test@example.com",
    emailVerified: true,
    status: "active",
    role: "user",
    sessionVersion: 0,
  });

  const oldToken = createAccessToken(user);

  await User.updateOne(
    { _id: user._id },
    { $inc: { sessionVersion: 1 } }
  );

  const req = {
    cookies: { access_token: oldToken },
  };

  const res = mockResponse();
  let nextCalled = false;

  await requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(
    res.body.message,
    "Session expired. Please log in again."
  );
});

test("current JWT is accepted when sessionVersion matches", async () => {
  const user = await User.create({
    name: "Current Session User",
    email: "current-session@example.com",
    emailVerified: true,
    status: "active",
    role: "user",
    sessionVersion: 0,
  });

  const token = createAccessToken(user);

  const req = {
    cookies: { access_token: token },
  };

  const res = mockResponse();
  let nextCalled = false;

  await requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(req.user.id, user._id.toString());
});
