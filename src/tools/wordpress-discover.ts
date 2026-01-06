import { z } from 'zod';
import type { PlaygroundOrchestrator } from '../orchestrator/index.js';
import { mcpRequest } from '../utils/http-client.js';

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

  // Call the instance's MCP Adapter to list tools
  const result = await mcpRequest(
    instance.mcpEndpoint,
    'tools/list',
    {}
  );

  return JSON.stringify(result, null, 2);
}
