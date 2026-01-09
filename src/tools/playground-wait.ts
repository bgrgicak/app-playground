import { z } from 'zod';
import type { PlaygroundOrchestrator } from '../orchestrator/index.js';
import { logger } from '../utils/logger.js';

export const waitToolName = 'playground_wait';

export const waitToolDescription = `
Wait for a Playground instance to become ready and fully operational.

This is useful when you've spawned an instance with wait_for_ready=false
and need to wait for it to finish initializing before using WordPress tools.

The tool polls the instance status and provides progress updates.

USAGE:
1. Spawn instance with wait_for_ready=false (returns immediately)
2. Use this tool to wait until status becomes 'running'
3. Optionally verify with playground_verify before using wordpress_discover

Returns when the instance is ready or times out after the specified duration.
`.trim();

export const waitInputSchema = {
  type: 'object' as const,
  properties: {
    instance_id: {
      type: 'string',
      description: 'The ID of the instance to wait for',
    },
    timeout_seconds: {
      type: 'number',
      description: 'Maximum time to wait in seconds (default: 120)',
    },
  },
  required: ['instance_id'],
};

export const WaitArgsSchema = z.object({
  instance_id: z.string(),
  timeout_seconds: z.number().optional().default(120),
});

export async function handleWait(
  orchestrator: PlaygroundOrchestrator,
  args: unknown
): Promise<string> {
  const parsed = WaitArgsSchema.parse(args);
  const timeoutMs = parsed.timeout_seconds * 1000;

  const instance = orchestrator.get(parsed.instance_id);

  if (!instance) {
    throw new Error(`Instance ${parsed.instance_id} not found`);
  }

  // If already running, return immediately
  if (instance.status === 'running') {
    return JSON.stringify({
      instance_id: parsed.instance_id,
      status: 'running',
      message: 'Instance is already ready',
      web_url: instance.webUrl,
      mcp_endpoint: instance.mcpEndpoint,
    }, null, 2);
  }

  // If in error state, return error
  if (instance.status === 'error') {
    return JSON.stringify({
      instance_id: parsed.instance_id,
      status: 'error',
      error: 'Instance is in error state',
      message: 'Use playground_destroy to remove this instance and try spawning again',
    }, null, 2);
  }

  logger.info(`Waiting for instance ${parsed.instance_id} to become ready...`);

  const startTime = Date.now();

  // Wait for instance to become ready
  const ready = await instance.waitUntilReady(timeoutMs);

  const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);

  if (ready) {
    return JSON.stringify({
      instance_id: parsed.instance_id,
      status: 'running',
      message: `Instance is ready after ${elapsedSeconds} seconds`,
      web_url: instance.webUrl,
      mcp_endpoint: instance.mcpEndpoint,
      admin_url: instance.adminUrl,
      elapsed_seconds: elapsedSeconds,
    }, null, 2);
  } else {
    return JSON.stringify({
      instance_id: parsed.instance_id,
      status: instance.status,
      error: `Instance did not become ready within ${parsed.timeout_seconds} seconds`,
      message: 'Try increasing timeout_seconds or use playground_verify to diagnose the issue',
      elapsed_seconds: elapsedSeconds,
    }, null, 2);
  }
}
