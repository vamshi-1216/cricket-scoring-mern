import { env } from "../config/env.js";

export async function requireAuth(req, res, next) {
  const cookie = req.headers.cookie;
  if (!cookie) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  try {
    const response = await fetch(
      `${env.AUTH_SERVICE_URL.replace(/\/+$/, "")}/api/v1/auth/me`,
      {
        headers: { Cookie: cookie, Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      }
    );
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }
    if (!response.ok || body?.success !== true || !body.data?.user?.id) {
      return res.status(503).json({
        success: false,
        message: "Unable to verify the authenticated user.",
      });
    }

    req.user = body.data.user;
    return next();
  } catch {
    return res.status(503).json({
      success: false,
      message: "Authentication Service is unavailable.",
    });
  }
}
