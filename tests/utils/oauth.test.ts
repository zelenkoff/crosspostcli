import { describe, test, expect } from "bun:test";
import { signRequest } from "../../src/utils/oauth.js";

describe("OAuth 1.0a signing", () => {
  test("produces Authorization header", () => {
    const headers = signRequest(
      {
        consumerKey: "test-key",
        consumerSecret: "test-secret",
        accessToken: "test-token",
        accessSecret: "test-access-secret",
      },
      {
        method: "POST",
        url: "https://api.twitter.com/2/tweets",
      },
    );

    expect(headers.Authorization).toStartWith("OAuth ");
    expect(headers.Authorization).toContain("oauth_consumer_key");
    expect(headers.Authorization).toContain("oauth_signature");
    expect(headers.Authorization).toContain("oauth_nonce");
    expect(headers.Authorization).toContain("oauth_timestamp");
    expect(headers.Authorization).toContain("oauth_version");
  });

  test("different requests produce different signatures", () => {
    const params = {
      consumerKey: "key",
      consumerSecret: "secret",
      accessToken: "token",
      accessSecret: "secret",
    };

    const h1 = signRequest(params, { method: "GET", url: "https://api.twitter.com/2/users/me" });
    const h2 = signRequest(params, { method: "POST", url: "https://api.twitter.com/2/tweets" });

    // Different nonces will make them different
    expect(h1.Authorization).not.toBe(h2.Authorization);
  });
});
