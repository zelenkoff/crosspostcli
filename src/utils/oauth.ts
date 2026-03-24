import { createHmac, randomBytes } from "crypto";

interface OAuthParams {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessSecret: string;
}

interface RequestParams {
  method: string;
  url: string;
  data?: Record<string, string>;
}

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

function generateTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

export function signRequest(oauth: OAuthParams, request: RequestParams): Record<string, string> {
  const nonce = generateNonce();
  const timestamp = generateTimestamp();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: oauth.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: oauth.accessToken,
    oauth_version: "1.0",
  };

  const allParams: Record<string, string> = { ...oauthParams, ...(request.data ?? {}) };

  const sortedParams = Object.keys(allParams)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(allParams[key])}`)
    .join("&");

  const baseString = [request.method.toUpperCase(), percentEncode(request.url), percentEncode(sortedParams)].join("&");

  const signingKey = `${percentEncode(oauth.consumerSecret)}&${percentEncode(oauth.accessSecret)}`;

  const signature = createHmac("sha1", signingKey).update(baseString).digest("base64");

  oauthParams.oauth_signature = signature;

  const authHeader =
    "OAuth " +
    Object.keys(oauthParams)
      .sort()
      .map((key) => `${percentEncode(key)}="${percentEncode(oauthParams[key])}"`)
      .join(", ");

  return { Authorization: authHeader };
}
