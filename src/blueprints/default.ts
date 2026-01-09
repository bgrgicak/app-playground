import type { Blueprint } from '../orchestrator/types.js';

/**
 * Creates the default blueprint with Abilities API and MCP Adapter installed.
 *
 * Note: The Abilities API is included in WordPress 6.9+, but we install
 * the plugin version for compatibility with older WordPress versions.
 */
export function createDefaultBlueprint(options?: {
  landingPage?: string;
}): Blueprint {
  return {
    landingPage: options?.landingPage ?? '/wp-admin/',
    steps: [
      // Log in as admin
      {
        step: 'login',
        username: 'admin',
        password: 'password',
      },

      // Install Abilities API plugin
      // TODO: Update URL once stable releases are available
      {
        step: 'installPlugin',
        pluginData: {
          resource: 'url',
          url: 'https://github.com/WordPress/abilities-api/releases/latest/download/abilities-api.zip',
        },
      },

      // Install MCP Adapter plugin
      // TODO: Update URL once stable releases are available
      // NOTE: This plugin has a session validation bug - see workaround in mcp-session.ts
      {
        step: 'installPlugin',
        pluginData: {
          resource: 'url',
          url: 'https://github.com/WordPress/mcp-adapter/releases/latest/download/mcp-adapter.zip',
        },
      },
    ],
  };
}

/**
 * Merge a user-provided blueprint with the default blueprint.
 * User steps are appended after the default setup steps.
 */
export function mergeBlueprints(
  defaultBlueprint: Blueprint,
  userBlueprint?: Blueprint
): Blueprint {
  if (!userBlueprint) {
    return defaultBlueprint;
  }

  return {
    landingPage: userBlueprint.landingPage ?? defaultBlueprint.landingPage,
    preferredVersions: {
      ...defaultBlueprint.preferredVersions,
      ...userBlueprint.preferredVersions,
    },
    steps: [
      ...(defaultBlueprint.steps ?? []),
      ...(userBlueprint.steps ?? []),
    ],
  };
}
