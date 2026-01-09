import { z } from 'zod';
import type { PlaygroundOrchestrator } from '../orchestrator/index.js';

export const verifyToolName = 'playground_verify';

export const verifyToolDescription = `
Verify that a Playground instance is fully operational and ready for WordPress operations.

This performs a series of health checks:
1. Instance exists and has status 'running'
2. Web server is responding at the webUrl
3. MCP endpoint is accessible and responding to requests
4. WordPress is initialized and serving pages

Use this after spawning an instance or when wordpress_discover fails to diagnose issues.

Returns detailed status of each check with specific error messages for debugging.
`.trim();

export const verifyInputSchema = {
  type: 'object' as const,
  properties: {
    instance_id: {
      type: 'string',
      description: 'The ID of the instance to verify',
    },
  },
  required: ['instance_id'],
};

export const VerifyArgsSchema = z.object({
  instance_id: z.string(),
});

interface VerificationResult {
  instance_id: string;
  checks: {
    instance_exists: boolean;
    instance_status: string;
    web_server_responding: boolean;
    mcp_endpoint_accessible: boolean;
    wordpress_initialized: boolean;
  };
  errors: string[];
  ready_for_operations: boolean;
  recommendations: string[];
}

export async function handleVerify(
  orchestrator: PlaygroundOrchestrator,
  args: unknown
): Promise<string> {
  const parsed = VerifyArgsSchema.parse(args);

  const result: VerificationResult = {
    instance_id: parsed.instance_id,
    checks: {
      instance_exists: false,
      instance_status: 'unknown',
      web_server_responding: false,
      mcp_endpoint_accessible: false,
      wordpress_initialized: false,
    },
    errors: [],
    ready_for_operations: false,
    recommendations: [],
  };

  // Check 1: Instance exists
  const instance = orchestrator.get(parsed.instance_id);
  if (!instance) {
    result.errors.push(`Instance ${parsed.instance_id} not found`);
    result.recommendations.push('Use playground_list to see available instances');
    return JSON.stringify(result, null, 2);
  }

  result.checks.instance_exists = true;
  result.checks.instance_status = instance.status;

  if (instance.status !== 'running') {
    result.errors.push(`Instance status is '${instance.status}', expected 'running'`);
    result.recommendations.push('Wait for instance to reach running status or use playground_status to check');
    return JSON.stringify(result, null, 2);
  }

  // Check 2: Web server responding
  try {
    const webResponse = await fetch(instance.webUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
      headers: {
        // Include WordPress Playground auto-login cookie to bypass redirect loop
        'Cookie': 'playground_auto_login_already_happened=1',
      },
      redirect: 'manual',
    });

    // Accept 200 OK or 302 redirect as successful (server is responding)
    if (webResponse.ok || webResponse.status === 302) {
      result.checks.web_server_responding = true;
    } else {
      result.errors.push(`Web server returned status ${webResponse.status}`);
    }
  } catch (error) {
    result.errors.push(`Web server not responding: ${error instanceof Error ? error.message : String(error)}`);
    result.recommendations.push('Instance may still be starting up - wait a few seconds and retry');
  }

  // Check 3: MCP endpoint accessible
  try {
    const mcpResponse = await fetch(instance.mcpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Include WordPress Playground auto-login cookie to bypass redirect loop
        'Cookie': 'playground_auto_login_already_happened=1',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
      signal: AbortSignal.timeout(5000),
      redirect: 'manual',
    });

    if (mcpResponse.ok) {
      result.checks.mcp_endpoint_accessible = true;
      const jsonResponse = await mcpResponse.json() as { result?: unknown; error?: unknown };

      // Check if we got a valid MCP response
      if (jsonResponse.result !== undefined || jsonResponse.error !== undefined) {
        result.checks.wordpress_initialized = true;
      }
    } else if (mcpResponse.status === 302) {
      result.errors.push(`MCP endpoint returned unexpected redirect - auto-login may not be working`);
    } else {
      result.errors.push(`MCP endpoint returned status ${mcpResponse.status}`);
    }
  } catch (error) {
    result.errors.push(`MCP endpoint not accessible: ${error instanceof Error ? error.message : String(error)}`);
    result.recommendations.push('MCP Adapter plugin may not be fully initialized - wait 5-10 seconds and retry');
    result.recommendations.push(`Try accessing ${instance.webUrl} directly in a browser to verify WordPress is running`);
  }

  // Determine overall readiness
  result.ready_for_operations =
    result.checks.instance_exists &&
    result.checks.instance_status === 'running' &&
    result.checks.web_server_responding &&
    result.checks.mcp_endpoint_accessible &&
    result.checks.wordpress_initialized;

  if (result.ready_for_operations) {
    result.recommendations.push('Instance is ready! You can now use wordpress_discover and wordpress_execute');
  }

  return JSON.stringify(result, null, 2);
}
