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
 * Make a JSON-RPC request to an MCP endpoint
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
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

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
 * Wait for an endpoint to become available with exponential backoff
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
        redirect: 'manual', // Don't follow redirects, just detect server is up
      });
      // Any HTTP response means the server is up and responding
      // This includes: 200 OK, 302 redirect, 404 not found, etc.
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
