import { z } from 'zod';
import type { PlaygroundOrchestrator } from '../orchestrator/index.js';
import { mcpRequestWithSession } from '../utils/mcp-session.js';
import { getBuiltInAbilities, executeBuiltInAbility } from '../utils/wordpress-abilities.js';

export const executeToolName = 'wordpress_execute';

export const executeToolDescription = `
Execute a WordPress ability on a Playground instance.

WORKFLOW:
1. First ensure the instance is running with playground_status
2. Use wordpress_discover to list available abilities and their parameter schemas
3. Then use this tool to execute a specific ability with the required parameters

The ability name should match exactly as returned by wordpress_discover (e.g., "core/create-post").
Parameters should conform to the schema defined for that ability.

Returns the JSON-RPC response from executing the WordPress ability.
`.trim();

export const executeInputSchema = {
  type: 'object' as const,
  properties: {
    instance_id: {
      type: 'string',
      description: 'The ID of the Playground instance',
    },
    ability: {
      type: 'string',
      description: 'The name of the ability to execute (e.g., "core/get-site-info")',
    },
    params: {
      type: 'object',
      description: 'Parameters to pass to the ability',
      additionalProperties: true,
    },
  },
  required: ['instance_id', 'ability'],
};

export const ExecuteArgsSchema = z.object({
  instance_id: z.string(),
  ability: z.string(),
  params: z.record(z.unknown()).optional(),
});

export async function handleExecute(
  orchestrator: PlaygroundOrchestrator,
  args: unknown
): Promise<string> {
  const parsed = ExecuteArgsSchema.parse(args);

  const instance = orchestrator.get(parsed.instance_id);

  if (!instance) {
    throw new Error(`Instance ${parsed.instance_id} not found`);
  }

  if (instance.status !== 'running') {
    return JSON.stringify({
      error: `Instance ${parsed.instance_id} is not ready yet`,
      current_status: instance.status,
      message: 'Instance must have status "running" before executing abilities. Use playground_status to check status, or use playground_verify to diagnose issues.',
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

  // MULTI-TIER ABILITY EXECUTION SYSTEM:
  // Tier 3: Try MCP Adapter first (with session fix) for custom abilities
  // Tier 1: Fall back to built-in abilities (WordPress REST API wrappers)
  //
  // The session fix mu-plugin should resolve the session validation bug,
  // allowing custom abilities registered via register_ability() to work.

  // Try MCP Adapter first (Tier 3 - True MCP abilities including custom ones)
  if (instance.mcpSessionId) {
    try {
      const result = await mcpRequestWithSession(
        instance.mcpEndpoint,
        instance.mcpSessionId,
        'tools/call',
        {
          name: parsed.ability,
          arguments: parsed.params ?? {},
        }
      );

      const mcpResult = result as Record<string, unknown>;
      return JSON.stringify({
        ...mcpResult,
        _meta: {
          source: 'mcp-adapter',
          ability: parsed.ability,
          note: 'Executed via MCP Adapter (session fix enabled)',
        },
      }, null, 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // If MCP Adapter fails, try built-in abilities as fallback
      // This handles the case where the ability might be a built-in one
      console.warn(`MCP Adapter execution failed for ${parsed.ability}, trying built-in fallback:`, message);
    }
  }

  // Try built-in abilities (Tier 1 - WordPress REST API wrappers)
  const builtInAbilities = getBuiltInAbilities();
  const isBuiltIn = builtInAbilities.some(a => a.name === parsed.ability);

  if (isBuiltIn) {
    try {
      const result = await executeBuiltInAbility(
        instance.webUrl,
        parsed.ability,
        parsed.params ?? {}
      );

      return JSON.stringify({
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        _meta: {
          source: 'built-in',
          ability: parsed.ability,
          note: 'Executed via WordPress REST API (built-in ability)',
        },
      }, null, 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return JSON.stringify({
        error: 'Failed to execute built-in ability',
        ability: parsed.ability,
        message,
        hint: 'Check the ability parameters and ensure WordPress is responding.',
      }, null, 2);
    }
  }

  // Ability not found in any tier
  return JSON.stringify({
    error: 'Ability not found',
    ability: parsed.ability,
    message: `Unknown ability: ${parsed.ability}`,
    hint: 'Use wordpress_discover to see available abilities. For custom REST endpoints, use wordpress_http.',
    available_built_in_abilities: builtInAbilities.map(a => a.name),
  }, null, 2);
}
