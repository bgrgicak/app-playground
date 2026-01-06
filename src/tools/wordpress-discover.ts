import { z } from 'zod';
import type { PlaygroundOrchestrator } from '../orchestrator/index.js';
import { mcpRequest } from '../utils/http-client.js';

export const discoverToolName = 'wordpress/discover';

export const discoverToolDescription = `
Discover available WordPress abilities on a Playground instance.

This queries the instance's MCP Adapter to list all registered abilities,
including their names, descriptions, and input/output schemas.
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
