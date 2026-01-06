import { z } from 'zod';
import type { PlaygroundOrchestrator } from '../orchestrator/index.js';

export const statusToolName = 'playground/status';

export const statusToolDescription = `
Get detailed status of a specific WordPress Playground instance.
`.trim();

export const statusInputSchema = {
  type: 'object' as const,
  properties: {
    instance_id: {
      type: 'string',
      description: 'The ID of the instance',
    },
  },
  required: ['instance_id'],
};

export const StatusArgsSchema = z.object({
  instance_id: z.string(),
});

export async function handleStatus(
  orchestrator: PlaygroundOrchestrator,
  args: unknown
): Promise<string> {
  const parsed = StatusArgsSchema.parse(args);

  const instance = orchestrator.get(parsed.instance_id);

  if (!instance) {
    throw new Error(`Instance ${parsed.instance_id} not found`);
  }

  return JSON.stringify(instance.metadata(), null, 2);
}
