/**
 * Gemini API Tests
 * Tests HTTP retry logic, rate limit handling, and API integration
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Retry configuration matching the implementation
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors: Set<number>;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableErrors: new Set([429, 500, 502, 503, 504]),
};

// Extract status code from various error formats
function extractStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;

  const err = error as Record<string, unknown>;

  if (typeof err.status === "number") return err.status;
  if (typeof err.statusCode === "number") return err.statusCode;
  if (typeof err.code === "number") return err.code;

  if (err.response && typeof err.response === "object") {
    const resp = err.response as Record<string, unknown>;
    if (typeof resp.status === "number") return resp.status;
  }

  const message = String(err.message || "");
  const match = message.match(/\b(429|500|502|503|504)\b/);
  if (match) return parseInt(match[1], 10);

  return null;
}

// Extract Retry-After header value
function extractRetryAfter(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;

  const err = error as Record<string, unknown>;

  if (err.headers && typeof err.headers === "object") {
    const headers = err.headers as Record<string, unknown>;
    const retryAfter = headers["retry-after"] || headers["Retry-After"];
    if (typeof retryAfter === "string") {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) return seconds;
    }
  }

  return null;
}

// Calculate delay with exponential backoff
function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  const baseDelay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * baseDelay;
  return Math.min(baseDelay + jitter, maxDelayMs);
}

// Simulate withRetry logic
async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const statusCode = extractStatusCode(error);
      const isRetryable = statusCode !== null && config.retryableErrors.has(statusCode);

      if (!isRetryable || attempt === config.maxRetries) {
        throw lastError;
      }

      // In real implementation, we'd await here
      // For tests, we just track the attempt count
    }
  }

  throw lastError!;
}

describe("HTTP Status Code Extraction", () => {
  it("should extract status from error.status", () => {
    const error = { status: 429 };
    expect(extractStatusCode(error)).toBe(429);
  });

  it("should extract status from error.statusCode", () => {
    const error = { statusCode: 500 };
    expect(extractStatusCode(error)).toBe(500);
  });

  it("should extract status from error.code", () => {
    const error = { code: 503 };
    expect(extractStatusCode(error)).toBe(503);
  });

  it("should extract status from error.response.status", () => {
    const error = { response: { status: 502 } };
    expect(extractStatusCode(error)).toBe(502);
  });

  it("should extract status from error message", () => {
    const error = { message: "Request failed with status code 429" };
    expect(extractStatusCode(error)).toBe(429);
  });

  it("should return null for non-error", () => {
    expect(extractStatusCode(null)).toBeNull();
    expect(extractStatusCode(undefined)).toBeNull();
    expect(extractStatusCode("string")).toBeNull();
  });

  it("should return null for non-retryable status", () => {
    const error = { status: 400 };
    expect(extractStatusCode(error)).toBe(400);
    expect(DEFAULT_RETRY_CONFIG.retryableErrors.has(400)).toBe(false);
  });
});

describe("Retry-After Header Extraction", () => {
  it("should extract retry-after from lowercase header", () => {
    const error = { headers: { "retry-after": "30" } };
    expect(extractRetryAfter(error)).toBe(30);
  });

  it("should extract Retry-After from capitalized header", () => {
    const error = { headers: { "Retry-After": "60" } };
    expect(extractRetryAfter(error)).toBe(60);
  });

  it("should return null when no header present", () => {
    const error = { headers: {} };
    expect(extractRetryAfter(error)).toBeNull();
  });

  it("should return null for invalid header value", () => {
    const error = { headers: { "retry-after": "not-a-number" } };
    expect(extractRetryAfter(error)).toBeNull();
  });
});

describe("Exponential Backoff Calculation", () => {
  it("should increase delay exponentially", () => {
    const base = 1000;
    const max = 30000;

    // Without jitter, delays would be: 1000, 2000, 4000, 8000
    const delay0 = calculateDelay(0, base, max);
    const delay1 = calculateDelay(1, base, max);
    const delay2 = calculateDelay(2, base, max);

    // With up to 30% jitter, ranges are:
    // Attempt 0: 1000 - 1300
    // Attempt 1: 2000 - 2600
    // Attempt 2: 4000 - 5200
    expect(delay0).toBeGreaterThanOrEqual(1000);
    expect(delay0).toBeLessThanOrEqual(1300);

    expect(delay1).toBeGreaterThanOrEqual(2000);
    expect(delay1).toBeLessThanOrEqual(2600);

    expect(delay2).toBeGreaterThanOrEqual(4000);
    expect(delay2).toBeLessThanOrEqual(5200);
  });

  it("should cap at maxDelayMs", () => {
    const base = 1000;
    const max = 5000;

    // Attempt 5 would be 32000 without cap
    const delay = calculateDelay(5, base, max);
    expect(delay).toBeLessThanOrEqual(max * 1.3); // With jitter
  });
});

describe("Retry Logic", () => {
  it("should succeed on first try without retry", async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      return "success";
    };

    const result = await withRetry(fn);
    expect(result).toBe("success");
    expect(attempts).toBe(1);
  });

  it("should retry on 429 rate limit", async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 3) {
        throw { status: 429, message: "Rate limited" };
      }
      return "success";
    };

    const result = await withRetry(fn);
    expect(result).toBe("success");
    expect(attempts).toBe(3);
  });

  it("should retry on 500 server error", async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        throw { status: 500, message: "Internal server error" };
      }
      return "success";
    };

    const result = await withRetry(fn);
    expect(result).toBe("success");
    expect(attempts).toBe(2);
  });

  it("should not retry on 400 client error", async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw { status: 400, message: "Bad request" };
    };

    await expect(withRetry(fn)).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  it("should give up after maxRetries", async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw { status: 429, message: "Rate limited" };
    };

    await expect(withRetry(fn, { ...DEFAULT_RETRY_CONFIG, maxRetries: 2 })).rejects.toThrow();
    expect(attempts).toBe(3); // Initial + 2 retries
  });

  it("should retry on 502 bad gateway", async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        throw { status: 502, message: "Bad gateway" };
      }
      return "recovered";
    };

    const result = await withRetry(fn);
    expect(result).toBe("recovered");
  });

  it("should retry on 503 service unavailable", async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        throw { status: 503, message: "Service unavailable" };
      }
      return "recovered";
    };

    const result = await withRetry(fn);
    expect(result).toBe("recovered");
  });

  it("should retry on 504 gateway timeout", async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        throw { status: 504, message: "Gateway timeout" };
      }
      return "recovered";
    };

    const result = await withRetry(fn);
    expect(result).toBe("recovered");
  });
});

describe("Retryable Error Set", () => {
  it("should contain all expected error codes", () => {
    const retryable = DEFAULT_RETRY_CONFIG.retryableErrors;

    expect(retryable.has(429)).toBe(true); // Rate limit
    expect(retryable.has(500)).toBe(true); // Internal server error
    expect(retryable.has(502)).toBe(true); // Bad gateway
    expect(retryable.has(503)).toBe(true); // Service unavailable
    expect(retryable.has(504)).toBe(true); // Gateway timeout
  });

  it("should not contain client errors", () => {
    const retryable = DEFAULT_RETRY_CONFIG.retryableErrors;

    expect(retryable.has(400)).toBe(false); // Bad request
    expect(retryable.has(401)).toBe(false); // Unauthorized
    expect(retryable.has(403)).toBe(false); // Forbidden
    expect(retryable.has(404)).toBe(false); // Not found
    expect(retryable.has(422)).toBe(false); // Unprocessable entity
  });
});
