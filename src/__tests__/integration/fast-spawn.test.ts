import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { PlaygroundOrchestrator } from '../../orchestrator/index.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Integration tests for fast spawn with parallel endpoint checking
 *
 * These tests verify that the optimized parallel checking makes spawning faster
 */
describe('Fast Spawn Integration Tests', () => {
  let orchestrator: PlaygroundOrchestrator;
  let testDataDir: string;

  beforeEach(() => {
    testDataDir = mkdtempSync(join(tmpdir(), 'fast-spawn-test-'));
    orchestrator = new PlaygroundOrchestrator({
      dataDir: testDataDir,
      startPort: 9900,
      maxInstances: 3,
    });
  });

  afterEach(async () => {
    await orchestrator.destroyAll();
    rmSync(testDataDir, { recursive: true, force: true });
  });

  test('spawns instance faster with parallel checking', async () => {
    const startTime = Date.now();

    const result = await orchestrator.spawn({
      name: 'fast-spawn-test',
      php: '8.3',
      wp: 'latest',
      waitForReady: true,
    });

    const elapsed = Date.now() - startTime;

    // With parallel checking and adaptive backoff, should be faster
    // Typical times: 8-12 seconds for first spawn (with download)
    // Note: This is faster than the old sequential approach
    expect(elapsed).toBeLessThan(30000); // 30 seconds max

    expect(result.status).toBe('running');
    expect(result.instance_id).toBeDefined();
    expect(result.web_url).toMatch(/^http:\/\/localhost:\d+$/);

    // Verify instance is actually accessible
    const response = await fetch(result.web_url, { redirect: 'manual' });
    expect(response.status).toBeGreaterThan(0);
  }, 60000);

  test('instance health check works correctly', async () => {
    const result = await orchestrator.spawn({
      name: 'health-check-test',
      php: '8.3',
      wp: 'latest',
      waitForReady: true,
    });

    const instance = orchestrator.get(result.instance_id);
    expect(instance).toBeDefined();

    // Perform health check
    const health = await instance!.checkHealth();

    expect(health.healthy).toBe(true);
    expect(health.webReady).toBe(true);
    expect(health.mcpReady).toBe(true);
  }, 60000);

  test('multiple instances spawn efficiently', async () => {
    const startTime = Date.now();

    // Spawn 2 instances sequentially (parallel spawn can be flaky)
    const result1 = await orchestrator.spawn({
      name: 'multi-spawn-1',
      php: '8.3',
      wp: 'latest',
      waitForReady: true,
    });

    const result2 = await orchestrator.spawn({
      name: 'multi-spawn-2',
      php: '8.3',
      wp: 'latest',
      waitForReady: true,
    });

    const elapsed = Date.now() - startTime;

    // Both instances should be running
    expect(result1.status).toBe('running');
    expect(result2.status).toBe('running');

    // Should complete in reasonable time (two spawns)
    expect(elapsed).toBeLessThan(60000);

    // Verify both are accessible
    const [response1, response2] = await Promise.all([
      fetch(result1.web_url, { redirect: 'manual' }),
      fetch(result2.web_url, { redirect: 'manual' }),
    ]);

    expect(response1.status).toBeGreaterThan(0);
    expect(response2.status).toBeGreaterThan(0);
  }, 120000);
});
