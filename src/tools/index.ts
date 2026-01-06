import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PlaygroundOrchestrator } from '../orchestrator/index.js';
import { logger } from '../utils/logger.js';

// Import all tools
import {
  spawnToolName,
  spawnToolDescription,
  SpawnArgsSchema,
  handleSpawn,
} from './playground-spawn.js';

import {
  destroyToolName,
  destroyToolDescription,
  DestroyArgsSchema,
  handleDestroy,
} from './playground-destroy.js';

import {
  listToolName,
  listToolDescription,
  handleList,
} from './playground-list.js';

import {
  statusToolName,
  statusToolDescription,
  StatusArgsSchema,
  handleStatus,
} from './playground-status.js';

import {
  discoverToolName,
  discoverToolDescription,
  DiscoverArgsSchema,
  handleDiscover,
} from './wordpress-discover.js';

import {
  executeToolName,
  executeToolDescription,
  ExecuteArgsSchema,
  handleExecute,
} from './wordpress-execute.js';

import {
  installCodeToolName,
  installCodeToolDescription,
  InstallCodeArgsSchema,
  handleInstallCode,
} from './wordpress-install-code.js';

import {
  verifyToolName,
  verifyToolDescription,
  VerifyArgsSchema,
  handleVerify,
} from './playground-verify.js';

/**
 * Register all tools with the MCP server
 */
export function registerTools(
  server: McpServer,
  orchestrator: PlaygroundOrchestrator
): void {
  // playground/spawn
  server.registerTool(
    spawnToolName,
    {
      description: spawnToolDescription,
      inputSchema: {
        name: z.string().optional().describe('Human-readable name for this instance'),
        php: z.enum(['8.4', '8.3', '8.2', '8.1', '8.0', '7.4']).optional().describe('PHP version to use (default: 8.3)'),
        wp: z.string().optional().describe('WordPress version to use (e.g., "latest", "6.5", "6.4"). Default: latest'),
      },
    },
    async (args) => {
      logger.debug(`Handling ${spawnToolName}`, args);
      try {
        const result = await handleSpawn(orchestrator, args);
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Error handling ${spawnToolName}`, error);
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
      }
    }
  );

  // playground/destroy
  server.registerTool(
    destroyToolName,
    {
      description: destroyToolDescription,
      inputSchema: {
        instance_id: z.string().describe('The ID of the instance to destroy'),
      },
    },
    async (args) => {
      logger.debug(`Handling ${destroyToolName}`, args);
      try {
        const result = await handleDestroy(orchestrator, args);
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Error handling ${destroyToolName}`, error);
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
      }
    }
  );

  // playground/list
  server.registerTool(
    listToolName,
    {
      description: listToolDescription,
    },
    async () => {
      logger.debug(`Handling ${listToolName}`);
      try {
        const result = await handleList(orchestrator);
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Error handling ${listToolName}`, error);
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
      }
    }
  );

  // playground/status
  server.registerTool(
    statusToolName,
    {
      description: statusToolDescription,
      inputSchema: {
        instance_id: z.string().describe('The ID of the instance'),
      },
    },
    async (args) => {
      logger.debug(`Handling ${statusToolName}`, args);
      try {
        const result = await handleStatus(orchestrator, args);
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Error handling ${statusToolName}`, error);
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
      }
    }
  );

  // wordpress/discover
  server.registerTool(
    discoverToolName,
    {
      description: discoverToolDescription,
      inputSchema: {
        instance_id: z.string().describe('The ID of the Playground instance'),
      },
    },
    async (args) => {
      logger.debug(`Handling ${discoverToolName}`, args);
      try {
        const result = await handleDiscover(orchestrator, args);
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Error handling ${discoverToolName}`, error);
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
      }
    }
  );

  // wordpress/execute
  server.registerTool(
    executeToolName,
    {
      description: executeToolDescription,
      inputSchema: {
        instance_id: z.string().describe('The ID of the Playground instance'),
        ability: z.string().describe('The name of the ability to execute (e.g., "core/get-site-info")'),
        params: z.record(z.unknown()).optional().describe('Parameters to pass to the ability'),
      },
    },
    async (args) => {
      logger.debug(`Handling ${executeToolName}`, args);
      try {
        const result = await handleExecute(orchestrator, args);
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Error handling ${executeToolName}`, error);
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
      }
    }
  );

  // wordpress/install-code
  server.registerTool(
    installCodeToolName,
    {
      description: installCodeToolDescription,
      inputSchema: {
        instance_id: z.string().describe('The ID of the Playground instance'),
        filename: z.string().describe('Name for the mu-plugin file (e.g., "my-custom-ability.php")'),
        code: z.string().describe('PHP code to install (should be complete, valid PHP including <?php tag)'),
      },
    },
    async (args) => {
      logger.debug(`Handling ${installCodeToolName}`, args);
      try {
        const result = await handleInstallCode(orchestrator, args);
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Error handling ${installCodeToolName}`, error);
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
      }
    }
  );

  // playground/verify
  server.registerTool(
    verifyToolName,
    {
      description: verifyToolDescription,
      inputSchema: {
        instance_id: z.string().describe('The ID of the instance to verify'),
      },
    },
    async (args) => {
      logger.debug(`Handling ${verifyToolName}`, args);
      try {
        const result = await handleVerify(orchestrator, args);
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Error handling ${verifyToolName}`, error);
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
      }
    }
  );

  logger.info('Registered 8 tools');
}
