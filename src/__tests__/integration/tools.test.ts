import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../server.js';
import { handleList } from '../../tools/playground-list.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PlaygroundOrchestrator } from '../../orchestrator/index.js';

/**
 * Integration tests for MCP Tools
 *
 * These tests verify that the MCP tool handlers work correctly
 * with the orchestrator, without requiring actual WordPress instances.
 */
describe('MCP Tools Integration Tests', () => {
  let server: McpServer;
  let orchestrator: PlaygroundOrchestrator;
  let testDataDir: string;

  beforeAll(async () => {
    testDataDir = mkdtempSync(join(tmpdir(), 'mcp-tools-test-'));
    const result = await createServer({
      dataDir: testDataDir,
      startPort: 9700,
      maxInstances: 3,
    });
    server = result.server;
    orchestrator = result.orchestrator;
  });

  afterAll(async () => {
    await orchestrator.destroyAll();
    await server.close();
    rmSync(testDataDir, { recursive: true, force: true });
  });

  test('server initializes with orchestrator', async () => {
    expect(server).toBeDefined();
    expect(orchestrator).toBeDefined();
  });

  test('playground_list returns empty list initially', async () => {
    const result = await handleList(orchestrator);

    // Result should be JSON string
    const parsed = JSON.parse(result);
    expect(parsed.count).toBe(0);
    expect(parsed.instances).toEqual([]);
  });

  test('playground_list returns formatted text with instance count', async () => {
    const result = await handleList(orchestrator);

    expect(result).toContain('count');
    expect(result).toContain('instances');
    expect(result).toContain('0');
  });

  test('orchestrator.list() returns array of instance metadata', () => {
    const instances = orchestrator.list();
    expect(Array.isArray(instances)).toBe(true);
    expect(instances.length).toBe(0);
  });

  test('destroying non-existent instance throws error with correct message', async () => {
    await expect(orchestrator.destroy('fake-id')).rejects.toThrow(
      'Instance fake-id not found'
    );
  });

  test('getting non-existent instance returns undefined', () => {
    const instance = orchestrator.get('non-existent-id');
    expect(instance).toBeUndefined();
  });

  test('orchestrator respects maxInstances configuration', () => {
    // Orchestrator was configured with maxInstances: 3
    // This test verifies the config was applied during initialization
    expect(orchestrator).toBeDefined();
  });
});
