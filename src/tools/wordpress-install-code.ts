import { z } from 'zod';
import type { PlaygroundOrchestrator } from '../orchestrator/index.js';

export const installCodeToolName = 'wordpress_install_code';

export const installCodeToolDescription = `
Install custom PHP code as a must-use plugin on a Playground instance.

This allows you to add new WordPress abilities or functionality dynamically.
The code is installed as a mu-plugin and is immediately active.

PREREQUISITES:
- The instance must be running (status 'running')
- The code must be valid, complete PHP including <?php opening tag

WORKFLOW:
1. Verify instance is running with playground_status
2. Write complete PHP code with proper WordPress hooks/filters
3. Install using this tool
4. Wait a moment for WordPress to detect the new mu-plugin
5. Use wordpress_discover to verify new abilities are registered (if applicable)

NOTES:
- This feature may not be available on all instances (depends on core/run-php ability)
- If unavailable, you'll receive manual installation instructions
- The mu-plugin is activated immediately, no need to enable it in WP admin
- For testing, you can visit the instance webUrl to verify functionality
`.trim();

export const installCodeInputSchema = {
  type: 'object' as const,
  properties: {
    instance_id: {
      type: 'string',
      description: 'The ID of the Playground instance',
    },
    filename: {
      type: 'string',
      description: 'Name for the mu-plugin file (e.g., "my-custom-ability.php")',
    },
    code: {
      type: 'string',
      description: 'PHP code to install (should be complete, valid PHP including <?php tag)',
    },
  },
  required: ['instance_id', 'filename', 'code'],
};

export const InstallCodeArgsSchema = z.object({
  instance_id: z.string(),
  filename: z.string(),
  code: z.string(),
});

export async function handleInstallCode(
  orchestrator: PlaygroundOrchestrator,
  args: unknown
): Promise<string> {
  const parsed = InstallCodeArgsSchema.parse(args);

  const instance = orchestrator.get(parsed.instance_id);

  if (!instance) {
    throw new Error(`Instance ${parsed.instance_id} not found`);
  }

  if (instance.status !== 'running') {
    return JSON.stringify({
      success: false,
      error: `Instance ${parsed.instance_id} is not ready yet`,
      current_status: instance.status,
      message: 'Instance must have status "running" before installing code. Use playground_status to check status, or use playground_verify to diagnose issues.',
    }, null, 2);
  }

  // Ensure filename ends with .php
  const filename = parsed.filename.endsWith('.php')
    ? parsed.filename
    : `${parsed.filename}.php`;

  // Use the Playground's writeFile API to create the mu-plugin
  try {
    // Write the file directly to the WordPress mu-plugins directory
    const muPluginPath = `/wordpress/wp-content/mu-plugins/${filename}`;
    // Type assertion needed because RunCLIServer.playground type is complex
    await (instance.playground as any).writeFile(muPluginPath, parsed.code);

    return JSON.stringify({
      success: true,
      message: 'Code installed successfully as mu-plugin',
      path: muPluginPath,
      filename,
      note: 'The mu-plugin is now active. Use wordpress_discover to see if new abilities were registered.',
    }, null, 2);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: `Failed to install code: ${errorMessage}`,
      manual_steps: [
        `1. Access the instance at ${instance.webUrl}`,
        `2. Create file: wp-content/mu-plugins/${filename}`,
        `3. Paste the provided code`,
      ],
      code: parsed.code,
    }, null, 2);
  }
}
