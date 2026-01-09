import { logger } from './logger.js';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Make a JSON-RPC 2.0 request to an MCP endpoint.
 *
 * Handles WordPress Playground auto-login cookies to prevent redirect loops.
 * Throws on HTTP errors, redirects, or JSON-RPC error responses.
 *
 * @param endpoint - Full URL to the MCP endpoint
 * @param method - JSON-RPC method name (e.g., 'tools/list')
 * @param params - Optional parameters for the method
 * @param timeoutMs - Request timeout in milliseconds (default: 30000)
 * @returns The JSON-RPC result field
 * @throws Error on network issues, HTTP errors, or RPC errors
 */
export async function mcpRequest(
  endpoint: string,
  method: string,
  params?: unknown,
  timeoutMs: number = 30000
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    };

    logger.debug(`MCP request to ${endpoint}`, { method, params });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Include WordPress Playground auto-login cookie to bypass redirect loop
        'Cookie': 'playground_auto_login_already_happened=1',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
      // Don't follow redirects - if we still get redirected with the cookie, it's an error
      redirect: 'manual',
    });

    // Check for unexpected redirects
    if (response.status === 301 || response.status === 302) {
      throw new Error(`Unexpected redirect to ${response.headers.get('location')} - auto-login cookie may not be working`);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json() as JsonRpcResponse;

    if (json.error) {
      throw new Error(`MCP error ${json.error.code}: ${json.error.message}`);
    }

    logger.debug(`MCP response from ${endpoint}`, json.result);
    return json.result;

  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Wait for an endpoint to become available using exponential backoff.
 *
 * Checks if a URL responds to GET requests. Retries with increasing
 * intervals (1.5x multiplier) up to maxIntervalMs.
 *
 * @param url - URL to check
 * @param maxAttempts - Maximum number of attempts (default: 60)
 * @param initialIntervalMs - Starting interval between attempts (default: 100ms)
 * @returns true if endpoint became available, false if max attempts reached
 */
export async function waitForEndpoint(
  url: string,
  maxAttempts: number = 60,
  initialIntervalMs: number = 100
): Promise<boolean> {
  let intervalMs = initialIntervalMs;
  const maxIntervalMs = 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
        headers: {
          // Include WordPress Playground auto-login cookie to bypass redirect loop
          'Cookie': 'playground_auto_login_already_happened=1',
        },
        redirect: 'manual',
      });
      // Any HTTP response (including 200, 302, 404) means server is up
      // 302 with auto-login cookie means the redirect is working correctly
      if (response.status > 0) {
        logger.debug(`Endpoint ready after ${attempt + 1} attempts`, { url });
        return true;
      }
    } catch {
      // Connection refused or timeout - keep trying
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));

    // Exponential backoff: double interval each time up to max
    intervalMs = Math.min(intervalMs * 1.5, maxIntervalMs);
  }

  return false;
}
