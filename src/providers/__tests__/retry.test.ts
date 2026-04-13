import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchProviderWithRetry } from "../base.js";

const originalFetch = globalThis.fetch;

describe("fetchProviderWithRetry", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns on first success without retry", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    globalThis.fetch = mockFetch;

    const res = await fetchProviderWithRetry("https://example.com", { method: "POST" }, "p1", 5000);
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 and succeeds", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response("rate limit", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    globalThis.fetch = mockFetch;

    const res = await fetchProviderWithRetry(
      "https://example.com",
      { method: "POST" },
      "p1",
      5000,
      { maxAttempts: 3, backoffMs: 10 },
    );
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries on 503 and succeeds", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    globalThis.fetch = mockFetch;

    const res = await fetchProviderWithRetry(
      "https://example.com",
      { method: "POST" },
      "p1",
      5000,
      { maxAttempts: 2, backoffMs: 10 },
    );
    expect(res.status).toBe(200);
  });

  it("returns error response when all retries exhausted", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValue(new Response("error", { status: 502 }));
    globalThis.fetch = mockFetch;

    const res = await fetchProviderWithRetry(
      "https://example.com",
      { method: "POST" },
      "p1",
      5000,
      { maxAttempts: 2, backoffMs: 10 },
    );
    expect(res.status).toBe(502);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 400 (not retryable)", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValue(new Response("bad request", { status: 400 }));
    globalThis.fetch = mockFetch;

    const res = await fetchProviderWithRetry(
      "https://example.com",
      { method: "POST" },
      "p1",
      5000,
      { maxAttempts: 3, backoffMs: 10 },
    );
    expect(res.status).toBe(400);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries on timeout error", async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    globalThis.fetch = mockFetch;

    const res = await fetchProviderWithRetry(
      "https://example.com",
      { method: "POST" },
      "p1",
      5000,
      { maxAttempts: 2, backoffMs: 10 },
    );
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("defaults to 1 attempt when no retry config", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValue(new Response("error", { status: 503 }));
    globalThis.fetch = mockFetch;

    const res = await fetchProviderWithRetry("https://example.com", { method: "POST" }, "p1", 5000);
    expect(res.status).toBe(503);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
