import { env } from "../config/env.js";

function sanitizedEndpoint(url) {
  const parsed = new URL(url);
  parsed.username = "";
  parsed.password = "";
  parsed.search = "";
  parsed.hash = "";
  return `${parsed.origin}${parsed.pathname}`;
}

function authFailureCategory(error) {
  const causes = [];
  for (let current = error; current && causes.length < 4; current = current.cause) {
    causes.push(current);
  }
  if (causes.some((cause) =>
    ["TimeoutError", "AbortError"].includes(cause.name) ||
    ["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(cause.code)
  )) {
    return "AUTH_REQUEST_TIMEOUT";
  }
  if (causes.some((cause) => cause.code === "ECONNREFUSED")) {
    return "AUTH_CONNECTION_REFUSED";
  }
  if (causes.some((cause) =>
    ["ENOTFOUND", "EAI_AGAIN"].includes(cause.code)
  )) {
    return "AUTH_DNS_ERROR";
  }
  return "AUTH_REQUEST_FAILED";
}

export async function requireAuth(req, res, next) {
  const cookie = req.headers.cookie;
  if (!cookie) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  try {
    const endpointUrl =
      `${env.AUTH_SERVICE_URL.replace(/\/+$/, "")}/api/v1/auth/me`;
    const response = await fetch(
      endpointUrl,
      {
        cache: "no-store",
        headers: { Cookie: cookie, Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      }
    );
    let body;
    let validJson = true;
    try {
      body = await response.json();
    } catch {
      body = {};
      validJson = false;
    }
    const expectedUserExists = Boolean(body?.data?.user?.id);
    const errorCategory =
      response.status === 401
        ? "AUTH_HTTP_401"
        : !response.ok
          ? "AUTH_HTTP_ERROR"
          : !validJson
            ? "AUTH_INVALID_JSON"
            : body?.success !== true || !expectedUserExists
              ? "AUTH_RESPONSE_INVALID"
              : "NONE";
    console.info("Match Service Auth verification diagnostic", {
      endpoint: sanitizedEndpoint(endpointUrl),
      status: response.status,
      validJson,
      expectedUserExists,
      errorCategory,
    });
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
  } catch (error) {
    const endpointUrl =
      `${env.AUTH_SERVICE_URL.replace(/\/+$/, "")}/api/v1/auth/me`;
    console.warn("Match Service Auth verification diagnostic", {
      endpoint: sanitizedEndpoint(endpointUrl),
      status: null,
      validJson: false,
      expectedUserExists: false,
      errorCategory: authFailureCategory(error),
    });
    return res.status(503).json({
      success: false,
      message: "Authentication Service is unavailable.",
    });
  }
}
