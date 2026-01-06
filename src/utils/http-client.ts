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
 * Wait for an endpoint to become available
 */
export async function waitForEndpoint(
  url: string,
  maxAttempts: number = 30,
  intervalMs: number = 1000
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
        redirect: 'manual', // Don't follow redirects, just detect server is up
      });
      // Any HTTP response means the server is up and responding
      // This includes: 200 OK, 302 redirect, 404 not found, etc.
      if (response.status > 0) {
        return true;
      }
    } catch {
      // Connection refused or timeout - keep trying
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  return false;
}
