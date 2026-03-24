import express from "express";
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

// India marketplace uses the EU SP-API endpoint.
const SP_API_HOST = "sellingpartnerapi-eu.amazon.com";
const SP_API_BASE_URL = `https://${SP_API_HOST}`;

const {
  // Login with Amazon / SP-API app setup
  AMAZON_SELLER_APP_ID,
  LWA_CLIENT_ID,
  LWA_CLIENT_SECRET,
  OAUTH_REDIRECT_URI,
  LWA_REFRESH_TOKEN,

  // AWS IAM credentials used for SigV4 signing
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_REGION = "eu-west-1",

  // India marketplace id default
  MARKETPLACE_ID = "A21TJRUUN4KGV"
} = process.env;

function assertConfig(keys) {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
}

function hmac(key, data, encoding) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest(encoding);
}

function sha256(data, encoding = "hex") {
  return crypto.createHash("sha256").update(data, "utf8").digest(encoding);
}

function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = hmac(`AWS4${key}`, dateStamp);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  return hmac(kService, "aws4_request");
}

function signRequest({ method, path, queryString, payload, accessToken }) {
  const service = "execute-api";
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const canonicalHeaders =
    `host:${SP_API_HOST}\n` +
    `x-amz-access-token:${accessToken}\n` +
    `x-amz-date:${amzDate}\n`;

  const signedHeaders = "host;x-amz-access-token;x-amz-date";
  const payloadHash = sha256(payload ?? "");

  const canonicalRequest = [
    method,
    path,
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");

  const credentialScope = `${dateStamp}/${AWS_REGION}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest)
  ].join("\n");

  const signingKey = getSignatureKey(AWS_SECRET_ACCESS_KEY, dateStamp, AWS_REGION, service);
  const signature = hmac(signingKey, stringToSign, "hex");

  const authorizationHeader =
    `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    headers: {
      host: SP_API_HOST,
      "x-amz-date": amzDate,
      "x-amz-access-token": accessToken,
      Authorization: authorizationHeader,
      "Content-Type": "application/json"
    }
  };
}

async function exchangeOAuthCodeForRefreshToken(code) {
  assertConfig(["LWA_CLIENT_ID", "LWA_CLIENT_SECRET", "OAUTH_REDIRECT_URI"]);

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: LWA_CLIENT_ID,
    client_secret: LWA_CLIENT_SECRET,
    redirect_uri: OAUTH_REDIRECT_URI
  });

  const { data } = await axios.post("https://api.amazon.com/auth/o2/token", params, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });

  return data;
}

async function getLwaAccessTokenFromRefreshToken(refreshToken = LWA_REFRESH_TOKEN) {
  assertConfig(["LWA_CLIENT_ID", "LWA_CLIENT_SECRET"]);
  if (!refreshToken) throw new Error("Missing refresh token. Complete OAuth first.");

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: LWA_CLIENT_ID,
    client_secret: LWA_CLIENT_SECRET
  });

  const { data } = await axios.post("https://api.amazon.com/auth/o2/token", params, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });

  return data.access_token;
}

function getConsentUrl(state = crypto.randomUUID()) {
  assertConfig(["AMAZON_SELLER_APP_ID"]);

  const params = new URLSearchParams({
    application_id: AMAZON_SELLER_APP_ID,
    state,
    version: "beta"
  });

  return {
    state,
    consentUrl: `https://sellercentral.amazon.in/apps/authorize/consent?${params.toString()}`
  };
}

async function getBasicSalesSummary({ days = 7, refreshToken } = {}) {
  assertConfig(["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]);

  const lookbackDays = Number(days);
  if (!Number.isFinite(lookbackDays) || lookbackDays < 1 || lookbackDays > 30) {
    throw new Error("days must be between 1 and 30");
  }

  const accessToken = await getLwaAccessTokenFromRefreshToken(refreshToken);

  const createdAfter = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const query = new URLSearchParams({
    MarketplaceIds: MARKETPLACE_ID,
    CreatedAfter: createdAfter,
    OrderStatuses: "Shipped"
  }).toString();

  const path = "/orders/v0/orders";
  const signed = signRequest({
    method: "GET",
    path,
    queryString: query,
    payload: "",
    accessToken
  });

  const { data } = await axios.get(`${SP_API_BASE_URL}${path}?${query}`, {
    headers: signed.headers
  });

  const orders = data?.payload?.Orders ?? [];
  const totalSales = orders.reduce((sum, order) => {
    const value = Number(order?.OrderTotal?.Amount ?? 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  return {
    marketplaceId: MARKETPLACE_ID,
    currency: orders[0]?.OrderTotal?.CurrencyCode ?? "INR",
    period: `Last ${lookbackDays} day(s)`,
    orderCount: orders.length,
    totalSales: Number(totalSales.toFixed(2)),
    orders
  };
}

/**
 * Step 1: Get authorization URL and open it in browser.
 */
app.get("/auth/amazon/url", (req, res) => {
  try {
    const stateFromClient = req.query.state?.toString();
    const result = getConsentUrl(stateFromClient);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Step 2: Set this as redirect URI in your Security Profile.
 * Amazon redirects here with `spapi_oauth_code`.
 */
app.get("/auth/amazon/callback", async (req, res) => {
  try {
    const oauthCode = req.query.spapi_oauth_code?.toString();
    const sellingPartnerId = req.query.selling_partner_id?.toString();

    if (!oauthCode) {
      return res.status(400).json({
        success: false,
        message: "Missing spapi_oauth_code in query params."
      });
    }

    const tokenData = await exchangeOAuthCodeForRefreshToken(oauthCode);

    // Important: persist tokenData.refresh_token securely in your DB/secrets manager.
    return res.json({
      success: true,
      message: "OAuth completed. Save refresh_token securely.",
      sellingPartnerId,
      tokenData
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "OAuth token exchange failed.",
      error: error.response?.data || error.message
    });
  }
});

/**
 * Basic sales endpoint for dashboard cards/charts.
 */
app.get("/api/sales/basic", async (req, res) => {
  try {
    const days = req.query.days?.toString() || "7";
    const summary = await getBasicSalesSummary({ days });

    res.json({
      success: true,
      message: "Basic sales summary fetched from Amazon Seller Central India.",
      data: summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch sales summary.",
      error: error.response?.data || error.message
    });
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
