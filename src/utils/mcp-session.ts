import { logger } from './logger.js';

export interface McpSessionInfo {
  sessionId: string;
  serverInfo: {
    name: string;
    version: string;
  };
  capabilities: Record<string, unknown>;
}

/**
 * Initialize an MCP session with a WordPress instance
 * This must be called before any other MCP operations
 */
export async function initializeMcpSession(
  mcpEndpoint: string,
  clientInfo: {
    name: string;
    version: string;
  } = {
    name: 'playground-mcp',
    version: '0.1.0',
  }
): Promise<McpSessionInfo> {
  logger.debug(`Initializing MCP session with ${mcpEndpoint}`);

  const response = await fetch(mcpEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': 'playground_auto_login_already_happened=1',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
        clientInfo,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to initialize MCP session: HTTP ${response.status}`);
  }

  // Extract session ID from response headers
  // Note: Some MCP implementations (like WordPress MCP Adapter) don't return
  // the session ID in headers. In that case, we generate a unique session ID.
  let sessionId = response.headers.get('Mcp-Session-Id');

  if (!sessionId) {
    // Generate a UUID v4 session ID
    sessionId = crypto.randomUUID();
    logger.debug(`Server did not return Mcp-Session-Id header, generated: ${sessionId}`);
  }

  const json = await response.json() as {
    jsonrpc: string;
    id: number;
    result?: {
      serverInfo: {
        name: string;
        version: string;
      };
      capabilities: Record<string, unknown>;
    };
    error?: {
      code: number;
      message: string;
    };
  };

  if (json.error) {
    throw new Error(`MCP initialize error: ${json.error.message}`);
  }

  if (!json.result) {
    throw new Error('MCP initialize returned no result');
  }

  logger.debug(`MCP session initialized: ${sessionId}`, {
    serverInfo: json.result.serverInfo,
  });

  return {
    sessionId,
    serverInfo: json.result.serverInfo,
    capabilities: json.result.capabilities,
  };
}

/**
 * Make an MCP request with session ID
 *
 * WORKAROUND: The WordPress MCP Adapter has a bug where it requires Mcp-Session-Id
 * header but doesn't issue valid session IDs. It rejects any client-generated IDs
 * with "Invalid or expired session". As a workaround, we try the request with the
 * session ID first, and if it fails with session validation error, we retry using
 * WordPress cookie authentication alone (which works for authenticated users).
 */
export async function mcpRequestWithSession(
  mcpEndpoint: string,
  sessionId: string,
  method: string,
  params?: unknown
): Promise<unknown> {
  // Try with session ID first (in case a properly-implemented server is used)
  let response = await fetch(mcpEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': 'playground_auto_login_already_happened=1',
      'Mcp-Session-Id': sessionId,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params: params || {},
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  let json = await response.json() as {
    jsonrpc: string;
    id: number;
    result?: unknown;
    error?: {
      code: number;
      message: string;
      data?: unknown;
    };
  };

  // Check for session validation errors
  if (json.error &&
      (json.error.message.includes('Invalid or expired session') ||
       json.error.message.includes('Missing Mcp-Session-Id header'))) {

    logger.debug(`Session validation failed, retrying with WordPress auth only`, {
      error: json.error.message,
      method,
    });

    // Retry without session header - rely on WordPress cookie auth
    response = await fetch(mcpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'playground_auto_login_already_happened=1',
        // Deliberately omit Mcp-Session-Id header
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params: params || {},
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    json = await response.json() as {
      jsonrpc: string;
      id: number;
      result?: unknown;
      error?: {
        code: number;
        message: string;
        data?: unknown;
      };
    };
  }

  if (json.error) {
    throw new Error(`MCP error ${json.error.code}: ${json.error.message}`);
  }

  return json.result;
}
