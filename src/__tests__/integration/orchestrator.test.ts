import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { PlaygroundOrchestrator } from '../../orchestrator/index.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Integration tests for PlaygroundOrchestrator
 *
 * These tests spin up real WordPress Playground instances and verify
 * the orchestrator can manage them correctly.
 *
 * Note: These tests take a long time to run (2-3 minutes each) because
 * WordPress Playground needs to download and initialize WordPress.
 *
 * To run only these tests: npm test orchestrator.test.ts
 * To skip these tests: npm test -- --exclude=orchestrator.test.ts
 */
describe('PlaygroundOrchestrator Integration Tests', () => {
  let orchestrator: PlaygroundOrchestrator;
  let testDataDir: string;

  beforeEach(() => {
    // Create temporary directory for each test
    testDataDir = mkdtempSync(join(tmpdir(), 'playground-test-'));
    orchestrator = new PlaygroundOrchestrator({
      dataDir: testDataDir,
      startPort: 9500,
      maxInstances: 5,
    });
  });

  afterEach(async () => {
    // Clean up all instances
    await orchestrator.destroyAll();
    // Clean up test directory
    rmSync(testDataDir, { recursive: true, force: true });
  });

  test('spawns a WordPress Playground instance', async () => {
    const result = await orchestrator.spawn({
      name: 'test-instance',
      php: '8.3',
      wp: 'latest',
    });

    // Verify result structure
    expect(result.instance_id).toBeDefined();
    expect(result.instance_id).toHaveLength(10);
    expect(result.name).toBe('test-instance');
    expect(result.web_url).toMatch(/^http:\/\/localhost:\d+$/);
    expect(result.mcp_endpoint).toMatch(/^http:\/\/localhost:\d+\/wp-json\/mcp\/mcp-adapter-default-server$/);
    expect(result.admin_url).toMatch(/^http:\/\/localhost:\d+\/wp-admin\/$/);
    expect(result.status).toBe('running');

    // Verify the instance is actually accessible via HTTP
    const response = await fetch(result.web_url, { redirect: 'manual' });
    // Any HTTP response means the server is up (200, 302, 404, etc.)
    expect(response.status).toBeGreaterThan(0);
  }, 300000);

  test('throws error when destroying non-existent instance', async () => {
    await expect(orchestrator.destroy('non-existent-id')).rejects.toThrow(
      'Instance non-existent-id not found'
    );
  });
});
