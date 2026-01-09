import { z } from 'zod';
import type { PlaygroundOrchestrator } from '../orchestrator/index.js';
import { mcpRequestWithSession } from '../utils/mcp-session.js';
import { getBuiltInAbilities } from '../utils/wordpress-abilities.js';

export const discoverToolName = 'wordpress_discover';

export const discoverToolDescription = `
Discover available WordPress abilities on a Playground instance.

This queries the instance's MCP Adapter plugin to list all registered WordPress abilities,
including their names, descriptions, and input/output schemas.

PREREQUISITES:
- The instance must have status 'running' (check with playground_status)
- WordPress and the MCP Adapter plugin must be fully initialized (may take a few seconds after spawn)
- The MCP endpoint must be responding (at http://localhost:PORT/wp-json/mcp/mcp-adapter-default-server)

TROUBLESHOOTING:
If this fails with "fetch failed" or network errors:
- The instance may still be initializing - wait 5-10 seconds and retry
- Verify the instance status with playground_status
- Check the webUrl is accessible in a browser
- The MCP Adapter plugin may not be fully activated yet

Returns a JSON-RPC response with the list of available abilities (tools) from the WordPress instance.
`.trim();

export const discoverInputSchema = {
  type: 'object' as const,
  properties: {
    instance_id: {
      type: 'string',
      description: 'The ID of the Playground instance',
    },
  },
  required: ['instance_id'],
};

export const DiscoverArgsSchema = z.object({
  instance_id: z.string(),
});

export async function handleDiscover(
  orchestrator: PlaygroundOrchestrator,
  args: unknown
): Promise<string> {
  const parsed = DiscoverArgsSchema.parse(args);

  const instance = orchestrator.get(parsed.instance_id);

  if (!instance) {
    throw new Error(`Instance ${parsed.instance_id} not found`);
  }

  if (instance.status !== 'running') {
    return JSON.stringify({
      error: `Instance ${parsed.instance_id} is not ready yet`,
      current_status: instance.status,
      message: 'Instance must have status "running" before discovering abilities. Use playground_status to check status, or use playground_verify to diagnose issues.',
    }, null, 2);
  }

  // Ensure MCP session is initialized
  if (!instance.mcpSessionId) {
    try {
      await instance.initializeMcpSession();
    } catch (error) {
      return JSON.stringify({
        error: 'Failed to initialize MCP session',
        message: error instanceof Error ? error.message : String(error),
        hint: 'The MCP Adapter may not be fully initialized. Wait a few seconds and try again.',
      }, null, 2);
    }
  }

  // MULTI-TIER ABILITY SYSTEM:
  // Tier 1: Try MCP Adapter (with session fix) for custom abilities
  // Tier 2: Fall back to built-in abilities (WordPress REST API wrappers)
  //
  // The session fix mu-plugin should resolve the session validation bug,
  // allowing custom abilities registered via register_ability() to work.

  // Try to get abilities from MCP Adapter first (Tier 3 - True MCP abilities)
  if (instance.mcpSessionId) {
    try {
      const result = await mcpRequestWithSession(
        instance.mcpEndpoint,
        instance.mcpSessionId,
        'tools/list',
        {}
      );

      // If successful, return MCP Adapter abilities (including custom registered abilities)
      const mcpResult = result as Record<string, unknown>;
      return JSON.stringify({
        ...mcpResult,
        _meta: {
          source: 'mcp-adapter',
          note: 'Custom abilities registered via WordPress Abilities API. Session fix enabled.',
        },
      }, null, 2);
    } catch (error) {
      // MCP Adapter failed, fall through to built-in abilities
      const message = error instanceof Error ? error.message : String(error);

      // Log warning if MCP Adapter still fails (session fix should have resolved this)
      console.warn('MCP Adapter still failing after session fix (falling back to built-in abilities):', message);
    }
  }

  // Return built-in abilities that use WordPress REST API directly (Tier 1)
  const abilities = getBuiltInAbilities();

  return JSON.stringify({
    tools: abilities.map(ability => ({
      name: ability.name,
      description: ability.description,
      inputSchema: ability.inputSchema,
    })),
    _meta: {
      source: 'built-in',
      note: 'Built-in abilities using WordPress REST API. For custom abilities, they should be registered via register_ability() and exposed through MCP Adapter.',
      hint: 'Use wordpress_http for custom REST endpoints not exposed as abilities.',
    },
  }, null, 2);
}
