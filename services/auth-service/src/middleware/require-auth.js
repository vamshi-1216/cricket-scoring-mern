
import { verifyAccessToken } from "../utils/jwt.js";
import { User } from "../modules/users/user.model.js";

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.access_token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    let payload;

    try {
      payload = verifyAccessToken(token);
    } catch {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired access token.",
      });
    }

    if (
      typeof payload.sub !== "string" ||
      !/^[a-f\d]{24}$/i.test(payload.sub)
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired access token.",
      });
    }

    const user = await User.findById(payload.sub)
      .select(
        "_id name email phone role status emailVerified phoneVerified sessionVersion"
      )
      .lean();

    if (!user || user.status !== "active") {
      return res.status(401).json({
        success: false,
        message: "User account is unavailable.",
      });
    }

    const tokenVersion = payload.sv ?? 0;
    const currentVersion = user.sessionVersion ?? 0;

    if (
      !Number.isSafeInteger(tokenVersion) ||
      tokenVersion < 0 ||
      tokenVersion !== currentVersion
    ) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please log in again.",
      });
    }

    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
    };

    return next();
  } catch (error) {
    return next(error);
  }
}
