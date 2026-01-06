import { z } from 'zod';
import type { PlaygroundOrchestrator } from '../orchestrator/index.js';

export const destroyToolName = 'playground/destroy';

export const destroyToolDescription = `
Destroy a WordPress Playground instance.

This stops the instance and removes all associated data.
The instance ID is no longer valid after this operation.
`.trim();

export const destroyInputSchema = {
  type: 'object' as const,
  properties: {
    instance_id: {
      type: 'string',
      description: 'The ID of the instance to destroy',
    },
  },
  required: ['instance_id'],
};

export const DestroyArgsSchema = z.object({
  instance_id: z.string(),
});

export async function handleDestroy(
  orchestrator: PlaygroundOrchestrator,
  args: unknown
): Promise<string> {
  const parsed = DestroyArgsSchema.parse(args);

  await orchestrator.destroy(parsed.instance_id);

  return JSON.stringify({
    success: true,
    message: `Instance ${parsed.instance_id} destroyed`,
  }, null, 2);
}
