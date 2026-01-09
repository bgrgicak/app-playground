import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { PlaygroundOrchestrator } from '../../orchestrator/index.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Integration tests for async spawn pattern
 *
 * These tests verify that spawn can return immediately while the instance
 * starts in the background, and that status can be polled.
 */
describe('Async Spawn Integration Tests', () => {
  let orchestrator: PlaygroundOrchestrator;
  let testDataDir: string;

  beforeEach(() => {
    testDataDir = mkdtempSync(join(tmpdir(), 'async-spawn-test-'));
    orchestrator = new PlaygroundOrchestrator({
      dataDir: testDataDir,
      startPort: 9800,
      maxInstances: 3,
    });
  });

  afterEach(async () => {
    await orchestrator.destroyAll();
    rmSync(testDataDir, { recursive: true, force: true });
  });

  test('spawn returns immediately when wait_for_ready is false', async () => {
    const startTime = Date.now();

    const result = await orchestrator.spawn({
      name: 'async-test',
      php: '8.3',
      wp: 'latest',
      waitForReady: false,
    });

    const elapsed = Date.now() - startTime;

    // Should return in under 20 seconds (much faster than waiting for ready)
    expect(elapsed).toBeLessThan(20000);

    // Should return with starting status
    expect(result.status).toBe('starting');
    expect(result.instance_id).toBeDefined();
    expect(result.web_url).toMatch(/^http:\/\/localhost:\d+$/);
  }, 30000);

  test('instance becomes ready after async spawn', async () => {
    const result = await orchestrator.spawn({
      name: 'async-ready-test',
      php: '8.3',
      wp: 'latest',
      waitForReady: false,
    });

    // Initially should be starting
    expect(result.status).toBe('starting');

    // Poll status until ready (max 2 minutes)
    let instance = orchestrator.get(result.instance_id);
    const maxAttempts = 60; // 60 * 2 seconds = 2 minutes
    let attempts = 0;

    while (instance && instance.status === 'starting' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      instance = orchestrator.get(result.instance_id);
      attempts++;
    }

    // Should eventually become running
    expect(instance).toBeDefined();
    expect(instance!.status).toBe('running');

    // Should be accessible
    const response = await fetch(result.web_url, { redirect: 'manual' });
    expect(response.status).toBeGreaterThan(0);
  }, 180000);
});
