import { runCLI, type RunCLIServer } from '@wp-playground/cli';
import { nanoid } from 'nanoid';
import { PlaygroundInstance } from './instance.js';
import { InstanceStore } from './store.js';
import type {
  SpawnOptions,
  SpawnResult,
  InstanceMetadata,
  OrchestratorOptions
} from './types.js';
import { createDefaultBlueprint, mergeBlueprints } from '../blueprints/default.js';
import { findAvailablePort, freePort, getProcessOnPort, findPlaygroundPorts } from '../utils/ports.js';
import { logger } from '../utils/logger.js';
import { withSuppressedStdout } from '../utils/suppress-stdout.js';
import { wordPressCrudAbilitiesPlugin } from '../blueprints/wordpress-crud-abilities-content.js';
import { mcpAdapterSessionFix } from '../blueprints/mcp-adapter-session-fix-content.js';

/**
 * MCP authentication bypass plugin for local development.
 *
 * This mu-plugin allows unauthenticated REST API access and bypasses MCP Adapter
 * session validation. This is safe for local Playground instances but should
 * NEVER be used in production environments.
 */
const MCP_LOCAL_AUTH_PLUGIN = `<?php
/**
 * Allow unauthenticated access to REST API endpoints for local development.
 * This is automatically added by the WordPress Playground MCP server.
 */

// Bypass REST API authentication
add_filter( 'rest_authentication_errors', function( $result ) {
    // If already authenticated or another error occurred, return as-is
    if ( true === $result || is_wp_error( $result ) ) {
        return $result;
    }

    // Check if this is a REST API request
    $request_uri = $_SERVER['REQUEST_URI'] ?? '';
    if ( strpos( $request_uri, '/wp-json/' ) !== false ) {
        // For local development, allow unauthenticated access
        // Set current user to admin (user ID 1)
        wp_set_current_user( 1 );
        return true;
    }

    return $result;
}, 99 );

// Bypass MCP Adapter session validation for local development
add_filter( 'mcp_adapter_validate_session', '__return_true', 1 );

// Bypass MCP permission checks - always allow access in local development
add_filter( 'user_has_cap', function( $allcaps, $caps, $args ) {
    // Check if this is an MCP-related capability check
    if ( !empty( $caps ) ) {
        foreach ( $caps as $cap ) {
            if ( in_array( $cap, ['read', 'edit_posts', 'publish_posts'] ) ) {
                // Grant all requested capabilities for MCP endpoints
                foreach ( $caps as $c ) {
                    $allcaps[$c] = true;
                }
            }
        }
    }
    return $allcaps;
}, 10, 3 );
`;

/**
 * Install MCP-related plugins to a WordPress Playground instance.
 *
 * This installs three mu-plugins:
 * 1. Local auth bypass - allows unauthenticated REST API access
 * 2. MCP Adapter session fix - fixes session validation bug
 * 3. WordPress CRUD abilities - registers custom MCP abilities
 *
 * @param playground - The Playground instance to configure
 * @param instanceId - Instance ID for logging
 */
async function installMcpPlugins(playground: any, instanceId: string): Promise<void> {
  try {
    logger.debug(`Configuring MCP plugins for instance ${instanceId}`);

    // Create mu-plugins directory if it doesn't exist
    await playground.mkdir('/wordpress/wp-content/mu-plugins').catch(() => {
      // Directory might already exist, ignore error
    });

    // Install authentication bypass plugin
    await playground.writeFile(
      '/wordpress/wp-content/mu-plugins/mcp-local-auth.php',
      MCP_LOCAL_AUTH_PLUGIN
    );
    logger.debug(`MCP authentication bypass configured for instance ${instanceId}`);

    // Install MCP Adapter session fix (fixes session validation bug)
    await playground.writeFile(
      '/wordpress/wp-content/mu-plugins/mcp-adapter-session-fix.php',
      mcpAdapterSessionFix
    );
    logger.debug(`MCP Adapter session fix installed for instance ${instanceId}`);

    // Install WordPress CRUD abilities plugin (registers custom MCP abilities)
    await playground.writeFile(
      '/wordpress/wp-content/mu-plugins/wordpress-crud-abilities.php',
      wordPressCrudAbilitiesPlugin
    );
    logger.debug(`WordPress CRUD abilities plugin installed for instance ${instanceId}`);

  } catch (error) {
    logger.warn(`Failed to configure MCP plugins for instance ${instanceId}`, error);
    throw error;
  }
}

/**
 * Manages WordPress Playground instances with MCP (Model Context Protocol) support.
 *
 * This orchestrator handles:
 * - Spawning new WordPress instances with configurable PHP/WP versions
 * - Port management and orphaned process cleanup
 * - MCP endpoint configuration and session management
 * - Instance lifecycle (start, stop, health checks)
 */
export class PlaygroundOrchestrator {
  private instances = new Map<string, PlaygroundInstance>();
  private store: InstanceStore;
  private startPort: number;
  private maxInstances: number;

  constructor(options: OrchestratorOptions) {
    this.store = new InstanceStore(options.dataDir);
    this.startPort = options.startPort ?? 9401;
    this.maxInstances = options.maxInstances ?? 10;

    logger.info('Orchestrator initialized', {
      dataDir: options.dataDir,
      startPort: this.startPort,
      maxInstances: this.maxInstances,
    });

    // Run startup recovery in background (don't block initialization)
    this.recoverOrphanedProcesses().catch(err => {
      logger.warn('Startup recovery failed', err);
    });
  }

  /**
   * Scan for and clean up orphaned Playground processes on startup
   */
  private async recoverOrphanedProcesses(): Promise<void> {
    logger.info('Scanning for orphaned Playground processes...');

    const endPort = this.startPort + this.maxInstances * 10; // Scan reasonable range
    const orphanedProcesses = await findPlaygroundPorts(this.startPort, endPort);

    if (orphanedProcesses.length === 0) {
      logger.info('No orphaned Playground processes found');
      return;
    }

    logger.warn(`Found ${orphanedProcesses.length} orphaned Playground process(es)`, {
      processes: orphanedProcesses.map(p => ({
        port: p.port,
        pid: p.pid,
        command: p.command,
      })),
    });

    // Clean up orphaned processes
    for (const proc of orphanedProcesses) {
      logger.info(`Cleaning up orphaned process on port ${proc.port} (PID ${proc.pid})`);

      const freed = await freePort(proc.port);

      if (freed) {
        logger.info(`Successfully cleaned up orphaned process on port ${proc.port}`);
      } else {
        logger.error(`Failed to clean up orphaned process on port ${proc.port}`);
      }
    }

    logger.info('Startup recovery complete');
  }

  /**
   * Spawn a new Playground instance
   */
  async spawn(options: SpawnOptions = {}): Promise<SpawnResult> {
    // Check instance limit
    if (this.instances.size >= this.maxInstances) {
      throw new Error(
        `Maximum number of instances (${this.maxInstances}) reached. ` +
        `Destroy an existing instance first.`
      );
    }

    const id = nanoid(10);
    const name = options.name ?? `playground-${id}`;
    const phpVersion = options.php ?? '8.3';
    const wpVersion = options.wp ?? 'latest';
    const waitForReady = options.waitForReady ?? true;

    logger.info(`Spawning instance ${id}...`, { name, phpVersion, wpVersion, waitForReady });

    // Find available port
    const port = await findAvailablePort(this.startPort);

    // Check if port is actually free (double-check for orphaned processes)
    const processInfo = await getProcessOnPort(port);
    if (processInfo) {
      logger.warn(`Port ${port} appears to be in use by process ${processInfo.pid}`, {
        command: processInfo.command,
        isPlayground: processInfo.isPlayground,
      });

      if (processInfo.isPlayground) {
        logger.info(`Attempting to free port ${port} by killing orphaned Playground process`);
        const freed = await freePort(port);

        if (!freed) {
          throw new Error(
            `Port ${port} is in use by an orphaned Playground process (PID ${processInfo.pid}) that could not be killed. ` +
            `Try manually killing it with: kill ${processInfo.pid}`
          );
        }

        logger.info(`Successfully freed port ${port}`);
      } else {
        throw new Error(
          `Port ${port} is in use by another process (PID ${processInfo.pid}): ${processInfo.command}. ` +
          `Either free the port or use a different port range with --start-port.`
        );
      }
    }

    // Create blueprint with required plugins
    const defaultBlueprint = createDefaultBlueprint();
    const blueprint = mergeBlueprints(defaultBlueprint, options.blueprint);

    try {
      logger.debug('Starting Playground CLI', { port, phpVersion, wpVersion });

      // Wrap runCLI to suppress stdout - the CLI writes progress messages
      // to stdout which would break the MCP JSON-RPC protocol
      const server: RunCLIServer = await withSuppressedStdout(() =>
        runCLI({
          command: 'server',
          port,
          php: phpVersion as '8.4' | '8.3' | '8.2' | '8.1' | '8.0' | '7.4',
          wp: wpVersion,
          login: true,
          blueprint,
          quiet: true,
        })
      );

      // Create instance wrapper
      const instance = new PlaygroundInstance({
        id,
        name,
        port,
        server,
        phpVersion,
        wpVersion,
      });

      // Store instance immediately (even if not ready yet)
      this.instances.set(id, instance);
      this.store.save(instance.metadata());

      // If waitForReady is false, return immediately with 'starting' status
      if (!waitForReady) {
        logger.info(`Instance ${id} spawning in background`, {
          webUrl: instance.webUrl,
          mcpEndpoint: instance.mcpEndpoint,
        });

        // Start readiness check in background
        instance.waitUntilReady(90000)
          .then(async () => {
            // Configure MCP plugins after instance is ready
            try {
              // Type assertion needed because RunCLIServer.playground type is complex
              const playground = instance.playground as any;
              await installMcpPlugins(playground, id);
            } catch (error) {
              logger.warn(`Failed to configure MCP plugins for instance ${id}`, error);
            }

            // Initialize MCP session
            logger.debug(`Initializing MCP session for instance ${id}`);
            try {
              await instance.initializeMcpSession();
            } catch (error) {
              logger.warn(`Failed to initialize MCP session for instance ${id}`, error);
            }

            // Update store when instance becomes ready (only if still exists)
            if (this.instances.has(id)) {
              this.store.save(instance.metadata());
            }
          })
          .catch(err => {
            logger.error(`Instance ${id} failed to become ready`, err);
            // Update store even on failure to persist error status (only if still exists)
            if (this.instances.has(id)) {
              this.store.save(instance.metadata());
            }
          });

        return {
          instance_id: id,
          name,
          web_url: instance.webUrl,
          mcp_endpoint: instance.mcpEndpoint,
          admin_url: instance.adminUrl,
          status: instance.status,
        };
      }

      // Wait for instance to be ready
      const ready = await instance.waitUntilReady(90000);

      if (!ready) {
        this.instances.delete(id);
        this.store.delete(id);
        await instance.stop();
        throw new Error('Instance failed to start within timeout');
      }

      // Configure MCP plugins for local development
      try {
        // Type assertion needed because RunCLIServer.playground type is complex
        const playground = instance.playground as any;
        await installMcpPlugins(playground, id);
      } catch (error) {
        logger.warn(`Failed to configure MCP plugins for instance ${id}`, error);
        // Don't fail the spawn if this configuration fails - the endpoint might still work
      }

      // Initialize MCP session
      logger.debug(`Initializing MCP session for instance ${id}`);
      try {
        await instance.initializeMcpSession();
      } catch (error) {
        logger.warn(`Failed to initialize MCP session for instance ${id}`, error);
        // Don't fail the spawn - session can be initialized later if needed
      }

      logger.info(`Instance ${id} spawned successfully`, {
        webUrl: instance.webUrl,
        mcpEndpoint: instance.mcpEndpoint,
        mcpSessionId: instance.mcpSessionId,
      });

      return {
        instance_id: id,
        name,
        web_url: instance.webUrl,
        mcp_endpoint: instance.mcpEndpoint,
        admin_url: instance.adminUrl,
        status: instance.status,
      };

    } catch (error) {
      logger.error(`Failed to spawn instance ${id}`, error);
      this.instances.delete(id);
      this.store.delete(id);

      // Provide helpful error messages for common issues
      if (error instanceof Error) {
        // Port collision error
        if (error.message.includes('EADDRINUSE') || error.message.includes('address already in use')) {
          throw new Error(
            `Failed to start instance on port ${port} - address already in use. ` +
            `This may indicate an orphaned process. Try running 'lsof -i :${port}' to identify the process, ` +
            `or use a different port with --start-port.`
          );
        }

        // Network errors
        if (error.message.includes('EACCES')) {
          throw new Error(
            `Permission denied when trying to bind to port ${port}. ` +
            `Ports below 1024 require root privileges. Try using --start-port with a value >= 1024.`
          );
        }
      }

      // Re-throw original error if not a known case
      throw error;
    }
  }

  /**
   * Destroy an instance
   */
  async destroy(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);

    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    await instance.stop();
    this.instances.delete(instanceId);
    this.store.delete(instanceId);

    logger.info(`Instance ${instanceId} destroyed`);
  }

  /**
   * Get a specific instance
   */
  get(instanceId: string): PlaygroundInstance | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * List all running instances
   */
  list(): InstanceMetadata[] {
    return Array.from(this.instances.values()).map(i => i.metadata());
  }

  /**
   * Destroy all instances (cleanup)
   */
  async destroyAll(): Promise<void> {
    logger.info('Destroying all instances...');

    const promises = Array.from(this.instances.keys()).map(id =>
      this.destroy(id).catch(err =>
        logger.error(`Failed to destroy instance ${id}`, err)
      )
    );

    await Promise.all(promises);

    logger.info('All instances destroyed');
  }
}

export { PlaygroundInstance } from './instance.js';
export * from './types.js';
