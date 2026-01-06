import { z } from 'zod';
import type { PlaygroundOrchestrator } from '../orchestrator/index.js';
import { mcpRequest } from '../utils/http-client.js';

export const installCodeToolName = 'wordpress/install-code';

export const installCodeToolDescription = `
Install custom PHP code as a must-use plugin on a Playground instance.

This allows you to add new WordPress abilities or functionality dynamically.
The code is installed as a mu-plugin and is immediately active.

IMPORTANT: The code should be valid PHP and should not include <?php opening tags
if you're providing just the function/class definitions.
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

  // Ensure filename ends with .php
  const filename = parsed.filename.endsWith('.php')
    ? parsed.filename
    : `${parsed.filename}.php`;

  // Create the mu-plugin via a runPHP blueprint step
  // This requires the instance to support direct PHP execution
  // We'll use the MCP Adapter's ability to run PHP if available,
  // or fall back to a REST API approach

  const phpCode = `
<?php
// Write the mu-plugin file
$mu_plugins_dir = WPMU_PLUGIN_DIR;
if (!file_exists($mu_plugins_dir)) {
    mkdir($mu_plugins_dir, 0755, true);
}

$code = base64_decode('${Buffer.from(parsed.code).toString('base64')}');
$filepath = $mu_plugins_dir . '/${filename}';

file_put_contents($filepath, $code);

if (file_exists($filepath)) {
    echo json_encode(['success' => true, 'path' => $filepath]);
} else {
    echo json_encode(['success' => false, 'error' => 'Failed to write file']);
}
`;

  // This assumes there's an ability to run arbitrary PHP
  // May need to adjust based on actual MCP Adapter capabilities
  try {
    const result = await mcpRequest(
      instance.mcpEndpoint,
      'tools/call',
      {
        name: 'core/run-php',  // This ability may not exist - fallback needed
        arguments: { code: phpCode },
      }
    );

    return JSON.stringify(result, null, 2);
  } catch {
    // Fallback: Return instructions for manual installation
    return JSON.stringify({
      success: false,
      message: 'Direct code installation not available. Manual installation required.',
      manual_steps: [
        `1. Access the instance at ${instance.webUrl}`,
        `2. Create file: wp-content/mu-plugins/${filename}`,
        `3. Paste the provided code`,
      ],
      code: parsed.code,
    }, null, 2);
  }
}
