import { User } from "./user.model.js";

export class ProfileError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "ProfileError";
    this.statusCode = statusCode;
  }
}

export async function updateUserProfile(userId, input) {
  if (typeof input?.name !== "string") {
    throw new ProfileError("Name is required.", 400);
  }

  const name = input.name.trim();

  if (name.length < 2 || name.length > 100) {
    throw new ProfileError(
      "Name must contain between 2 and 100 characters.",
      400
    );
  }

  const user = await User.findById(userId);

  if (!user || user.status !== "active") {
    throw new ProfileError("User account is unavailable.", 404);
  }

  user.name = name;
  await user.save();

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
  };
}