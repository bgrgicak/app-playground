// Instance status enum
export type InstanceStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

// Configuration for spawning a new instance
export interface SpawnOptions {
  name?: string;
  php?: '8.4' | '8.3' | '8.2' | '8.1' | '8.0' | '7.4';
  wp?: string;  // WordPress version: 'latest', '6.5', '6.4', etc.
  blueprint?: Blueprint;
  waitForReady?: boolean;  // If false, returns immediately while instance starts in background
}

// Minimal blueprint structure (subset of full Playground blueprint)
export interface Blueprint {
  landingPage?: string;
  preferredVersions?: {
    php?: string;
    wp?: string;
  };
  steps?: BlueprintStep[];
}

export interface BlueprintStep {
  step: string;
  [key: string]: unknown;
}

// Metadata about a running instance
export interface InstanceMetadata {
  id: string;
  name: string;
  port: number;
  status: InstanceStatus;
  phpVersion: string;
  wpVersion: string;
  createdAt: string;  // ISO date string
  webUrl: string;
  mcpEndpoint: string;
}

// Result from spawning an instance
export interface SpawnResult {
  instance_id: string;
  name: string;
  web_url: string;
  mcp_endpoint: string;
  admin_url: string;
  status: InstanceStatus;
}

// Options for the orchestrator
export interface OrchestratorOptions {
  dataDir: string;
  startPort?: number;
  maxInstances?: number;
}
