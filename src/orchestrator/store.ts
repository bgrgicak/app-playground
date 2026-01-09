import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { InstanceMetadata } from './types.js';
import { logger } from '../utils/logger.js';

/**
 * Simple JSON file-based store for instance metadata.
 * Each instance is stored in a separate JSON file.
 */
export class InstanceStore {
  private dataDir: string;
  private instancesDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.instancesDir = join(dataDir, 'instances');
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
    if (!existsSync(this.instancesDir)) {
      mkdirSync(this.instancesDir, { recursive: true });
    }
  }

  private instancePath(id: string): string {
    return join(this.instancesDir, `${id}.json`);
  }

  /**
   * Save instance metadata
   */
  save(metadata: InstanceMetadata): void {
    const path = this.instancePath(metadata.id);
    writeFileSync(path, JSON.stringify(metadata, null, 2));
    logger.debug(`Saved instance metadata: ${metadata.id}`);
  }

  /**
   * Load instance metadata
   */
  load(id: string): InstanceMetadata | null {
    const path = this.instancePath(id);
    if (!existsSync(path)) {
      return null;
    }

    try {
      const content = readFileSync(path, 'utf-8');
      return JSON.parse(content) as InstanceMetadata;
    } catch (error) {
      logger.error(`Failed to load instance ${id}`, error);
      return null;
    }
  }

  /**
   * Delete instance metadata
   */
  delete(id: string): void {
    const path = this.instancePath(id);
    if (existsSync(path)) {
      unlinkSync(path);
      logger.debug(`Deleted instance metadata: ${id}`);
    }
  }

  /**
   * List all stored instance metadata
   */
  listAll(): InstanceMetadata[] {
    // Note: This returns stored metadata, not live status
    // Live instances are tracked by the Orchestrator
    return [];
  }
}
