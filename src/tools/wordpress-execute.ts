import { z } from 'zod';
import type { PlaygroundOrchestrator } from '../orchestrator/index.js';
import { mcpRequest } from '../utils/http-client.js';

export const executeToolName = 'wordpress_execute';

export const executeToolDescription = `
Execute a WordPress ability on a Playground instance.

First use wordpress_discover to see available abilities, then use this tool
to execute them with the required parameters.
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

  // Call the instance's MCP Adapter to execute the ability
  const result = await mcpRequest(
    instance.mcpEndpoint,
    'tools/call',
    {
      name: parsed.ability,
      arguments: parsed.params ?? {},
    }
  );

  return JSON.stringify(result, null, 2);
}
