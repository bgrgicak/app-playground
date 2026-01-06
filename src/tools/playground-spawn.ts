import { z } from 'zod';
import type { PlaygroundOrchestrator } from '../orchestrator/index.js';

export const spawnToolName = 'playground_spawn';

export const spawnToolDescription = `
Create a new WordPress Playground instance.

Each instance runs WordPress with the Abilities API and MCP Adapter pre-installed,
allowing you to discover and execute WordPress abilities.

By default, this tool waits for the instance to be fully ready before returning (may take 60-90 seconds).
Set wait_for_ready to false to return immediately with status 'starting', then use playground_status
to poll until status becomes 'running'.

Returns the instance ID, web URL, and MCP endpoint for the new instance.
`.trim();

export const spawnInputSchema = {
  type: 'object' as const,
  properties: {
    name: {
      type: 'string',
      description: 'Human-readable name for this instance (optional)',
    },
    php: {
      type: 'string',
      enum: ['8.4', '8.3', '8.2', '8.1', '8.0', '7.4'],
      description: 'PHP version to use (default: 8.3)',
    },
    wp: {
      type: 'string',
      description: 'WordPress version to use (e.g., "latest", "6.5", "6.4"). Default: latest',
    },
    wait_for_ready: {
      type: 'boolean',
      description: 'If true (default), waits for instance to be ready. If false, returns immediately with status "starting".',
    },
  },
  required: [] as string[],
};

export const SpawnArgsSchema = z.object({
  name: z.string().optional(),
  php: z.enum(['8.4', '8.3', '8.2', '8.1', '8.0', '7.4']).optional(),
  wp: z.string().optional(),
  wait_for_ready: z.boolean().optional(),
});

export async function handleSpawn(
  orchestrator: PlaygroundOrchestrator,
  args: unknown
): Promise<string> {
  const parsed = SpawnArgsSchema.parse(args);

  const result = await orchestrator.spawn({
    name: parsed.name,
    php: parsed.php,
    wp: parsed.wp,
    waitForReady: parsed.wait_for_ready,
  });

  return JSON.stringify(result, null, 2);
}
