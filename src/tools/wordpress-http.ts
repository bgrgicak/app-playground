import { z } from 'zod';
import type { PlaygroundOrchestrator } from '../orchestrator/index.js';

export const httpToolName = 'wordpress_http';

export const httpToolDescription = `
Make an HTTP request to a WordPress instance's REST API.

This tool provides direct access to WordPress REST API endpoints, enabling:
- Custom plugin REST endpoints (e.g., /wp-json/myplugin/v1/data)
- Core WordPress endpoints not covered by built-in abilities
- Any WordPress REST API operation (GET, POST, PUT, DELETE, PATCH)

PREREQUISITES:
- The instance must have status 'running' (check with playground_status)
- WordPress must be fully initialized

USAGE:
1. Specify the HTTP method (GET, POST, PUT, DELETE, PATCH)
2. Provide the REST API path (e.g., /wp-json/wp/v2/posts or /wp-json/custom/v1/data)
3. Optional: Include query parameters for GET requests
4. Optional: Include body data for POST/PUT/PATCH requests

The tool automatically handles authentication using the WordPress auto-login cookie.

EXAMPLES:
- GET custom endpoint: method=GET, path=/wp-json/news/v1/items
- POST to custom endpoint: method=POST, path=/wp-json/news/v1/items, body={title: "News"}
- GET with params: method=GET, path=/wp-json/wp/v2/posts, params={per_page: 5}

Returns the JSON response from the WordPress REST API.
`.trim();

export const httpInputSchema = {
  type: 'object' as const,
  properties: {
    instance_id: {
      type: 'string',
      description: 'The ID of the Playground instance',
    },
    method: {
      type: 'string',
      enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      description: 'HTTP method',
    },
    path: {
      type: 'string',
      description: 'REST API path (e.g., /wp-json/wp/v2/posts or /wp-json/custom/v1/data)',
    },
    params: {
      type: 'object',
      description: 'Query parameters for GET requests (optional)',
      additionalProperties: true,
    },
    body: {
      type: 'object',
      description: 'Request body for POST/PUT/PATCH requests (optional)',
      additionalProperties: true,
    },
  },
  required: ['instance_id', 'method', 'path'],
};

export const HttpArgsSchema = z.object({
  instance_id: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  path: z.string(),
  params: z.record(z.unknown()).optional(),
  body: z.record(z.unknown()).optional(),
});

export async function handleHttp(
  orchestrator: PlaygroundOrchestrator,
  args: unknown
): Promise<string> {
  const parsed = HttpArgsSchema.parse(args);

  const instance = orchestrator.get(parsed.instance_id);

  if (!instance) {
    throw new Error(`Instance ${parsed.instance_id} not found`);
  }

  if (instance.status !== 'running') {
    return JSON.stringify({
      error: `Instance ${parsed.instance_id} is not ready yet`,
      current_status: instance.status,
      message: 'Instance must have status "running" before making HTTP requests. Use playground_status to check status, or use playground_verify to diagnose issues.',
    }, null, 2);
  }

  // Normalize path to ensure it starts with /wp-json/
  let apiPath = parsed.path;
  if (!apiPath.startsWith('/wp-json/')) {
    if (apiPath.startsWith('/')) {
      apiPath = '/wp-json' + apiPath;
    } else {
      apiPath = '/wp-json/' + apiPath;
    }
  }

  // Build URL with query parameters for GET requests
  let url = `${instance.webUrl}${apiPath}`;
  if (parsed.method === 'GET' && parsed.params) {
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(parsed.params)) {
      queryParams.set(key, String(value));
    }
    const queryString = queryParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  // Prepare request options
  const requestOptions: RequestInit = {
    method: parsed.method,
    headers: {
      'Content-Type': 'application/json',
      'Cookie': 'playground_auto_login_already_happened=1',
    },
  };

  // Add body for POST/PUT/PATCH requests
  if (['POST', 'PUT', 'PATCH'].includes(parsed.method) && parsed.body) {
    requestOptions.body = JSON.stringify(parsed.body);
  }

  try {
    const response = await fetch(url, requestOptions);

    if (!response.ok) {
      // Try to parse error response
      let errorMessage = response.statusText;
      try {
        const errorJson = await response.json() as { message?: string; code?: string };
        if (errorJson.message) {
          errorMessage = errorJson.message;
        }
      } catch {
        // Failed to parse error as JSON, use statusText
      }

      return JSON.stringify({
        error: `HTTP ${response.status}: ${errorMessage}`,
        status: response.status,
        statusText: response.statusText,
        method: parsed.method,
        url: url,
        hint: 'Check that the endpoint exists and your request body/parameters are correct.',
      }, null, 2);
    }

    // Parse successful response
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      return JSON.stringify({
        success: true,
        status: response.status,
        data,
        _meta: {
          method: parsed.method,
          url: url,
        },
      }, null, 2);
    } else {
      // Non-JSON response
      const text = await response.text();
      return JSON.stringify({
        success: true,
        status: response.status,
        data: text,
        contentType,
        _meta: {
          method: parsed.method,
          url: url,
          note: 'Response was not JSON',
        },
      }, null, 2);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      error: 'Request failed',
      message,
      method: parsed.method,
      url: url,
      hint: 'Check that the WordPress instance is running and the endpoint is accessible.',
    }, null, 2);
  }
}
