import type { PlaygroundOrchestrator } from '../orchestrator/index.js';

export const listToolName = 'playground_list';

export const listToolDescription = `
List all running WordPress Playground instances.

Returns an array of instance metadata including ID, name, status, URLs, and versions.
`.trim();

export const listInputSchema = {
  type: 'object' as const,
  properties: {},
  required: [] as string[],
};

export async function handleList(
  orchestrator: PlaygroundOrchestrator
): Promise<string> {
  const instances = orchestrator.list();

  return JSON.stringify({
    count: instances.length,
    instances,
  }, null, 2);
}
