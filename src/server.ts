import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PlaygroundOrchestrator } from './orchestrator/index.js';
import { registerTools } from './tools/index.js';
import { logger } from './utils/logger.js';

export interface ServerOptions {
  dataDir: string;
  startPort?: number;
  maxInstances?: number;
}

/**
 * Create the MCP server with orchestrator and tools
 */
export async function createServer(options: ServerOptions): Promise<{
  server: McpServer;
  orchestrator: PlaygroundOrchestrator;
}> {
  logger.info('Creating MCP server...', options);

  const orchestrator = new PlaygroundOrchestrator({
    dataDir: options.dataDir,
    startPort: options.startPort,
    maxInstances: options.maxInstances,
  });

  const server = new McpServer(
    {
      name: 'playground-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  registerTools(server, orchestrator);

  return { server, orchestrator };
}

/**
 * Run the MCP server with STDIO transport
 */
export async function runStdioServer(options: ServerOptions): Promise<void> {
  const { server, orchestrator } = await createServer(options);

  // Handle shutdown gracefully
  const shutdown = async () => {
    logger.info('Shutting down...');
    await orchestrator.destroyAll();
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Connect to STDIO transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('MCP server running on STDIO');
}
