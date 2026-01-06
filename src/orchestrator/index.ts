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
import { findAvailablePort } from '../utils/ports.js';
import { logger } from '../utils/logger.js';
import { withSuppressedStdout } from '../utils/suppress-stdout.js';

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

    logger.info(`Spawning instance ${id}...`, { name, phpVersion, wpVersion });

    // Find available port
    const port = await findAvailablePort(this.startPort);

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

      // Wait for instance to be ready
      const ready = await instance.waitUntilReady(90000);

      if (!ready) {
        await instance.stop();
        throw new Error('Instance failed to start within timeout');
      }

      // Store instance
      this.instances.set(id, instance);
      this.store.save(instance.metadata());

      logger.info(`Instance ${id} spawned successfully`, {
        webUrl: instance.webUrl,
        mcpEndpoint: instance.mcpEndpoint,
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
