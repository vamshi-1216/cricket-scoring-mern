import { User } from "./user.model.js";
import { hashPassword } from "../../utils/password.js";
import { registerSchema } from "./user.validation.js";

export class RegistrationError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "RegistrationError";
    this.statusCode = statusCode;
  }
}

export async function registerUser(input) {
  const validation = registerSchema.safeParse(input);

  if (!validation.success) {
    throw new RegistrationError(
      "Invalid registration details",
      400
    );
  }

  const { name, email, phone, password } = validation.data;

  const identifierConditions = [];

  if (email) identifierConditions.push({ email });
  if (phone) identifierConditions.push({ phone });

  const existingUser = await User.findOne({
    $or: identifierConditions
  }).lean();

  if (existingUser) {
    throw new RegistrationError(
      "An account with these details already exists",
      409
    );
  }

  const passwordHash = await hashPassword(password);

  try {
    const user = await User.create({
      name,
      email,
      phone,
      passwordHash,
      authProviders: [{ provider: "local", providerId: email || phone }],
      status: "pending_verification"
    });

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      status: user.status,
      createdAt: user.createdAt
    };
  } catch (error) {
    // A unique index also protects against concurrent registrations.
    if (error.code === 11000) {
      throw new RegistrationError(
        "An account with these details already exists",
        409
      );
    }

    throw error;
  }
}