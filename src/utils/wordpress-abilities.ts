import { logger } from './logger.js';

/**
 * Built-in WordPress abilities that work via REST API
 *
 * This bypasses the WordPress MCP Adapter's broken session validation
 * by implementing common WordPress operations directly via the REST API.
 */

export interface WordPressAbility {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Get list of built-in WordPress abilities
 */
export function getBuiltInAbilities(): WordPressAbility[] {
  return [
    {
      name: 'wordpress/posts/list',
      description: 'List WordPress posts',
      inputSchema: {
        type: 'object',
        properties: {
          per_page: {
            type: 'number',
            description: 'Number of posts to retrieve (default: 10)',
          },
          page: {
            type: 'number',
            description: 'Page number (default: 1)',
          },
          status: {
            type: 'string',
            description: 'Post status: publish, draft, pending, etc.',
          },
        },
      },
    },
    {
      name: 'wordpress/posts/create',
      description: 'Create a new WordPress post',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Post title',
          },
          content: {
            type: 'string',
            description: 'Post content (HTML)',
          },
          status: {
            type: 'string',
            description: 'Post status: draft, publish, pending (default: draft)',
          },
          excerpt: {
            type: 'string',
            description: 'Post excerpt',
          },
        },
        required: ['title', 'content'],
      },
    },
    {
      name: 'wordpress/posts/get',
      description: 'Get a WordPress post by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: 'Post ID',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'wordpress/posts/update',
      description: 'Update a WordPress post',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: 'Post ID',
          },
          title: {
            type: 'string',
            description: 'Post title',
          },
          content: {
            type: 'string',
            description: 'Post content (HTML)',
          },
          status: {
            type: 'string',
            description: 'Post status: draft, publish, pending',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'wordpress/posts/delete',
      description: 'Delete a WordPress post',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description: 'Post ID',
          },
          force: {
            type: 'boolean',
            description: 'Whether to bypass trash and force deletion',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'wordpress/pages/list',
      description: 'List WordPress pages',
      inputSchema: {
        type: 'object',
        properties: {
          per_page: {
            type: 'number',
            description: 'Number of pages to retrieve (default: 10)',
          },
          page: {
            type: 'number',
            description: 'Page number (default: 1)',
          },
        },
      },
    },
    {
      name: 'wordpress/pages/create',
      description: 'Create a new WordPress page',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Page title',
          },
          content: {
            type: 'string',
            description: 'Page content (HTML)',
          },
          status: {
            type: 'string',
            description: 'Page status: draft, publish, pending (default: draft)',
          },
        },
        required: ['title', 'content'],
      },
    },
    {
      name: 'wordpress/site/info',
      description: 'Get WordPress site information',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'wordpress/plugins/list',
      description: 'List installed WordPress plugins',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Plugin status: active, inactive, all (default: all)',
          },
        },
      },
    },
    {
      name: 'wordpress/themes/list',
      description: 'List installed WordPress themes',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Theme status: active, inactive (default: all)',
          },
        },
      },
    },
  ];
}

/**
 * Execute a built-in WordPress ability
 */
export async function executeBuiltInAbility(
  wordpressUrl: string,
  abilityName: string,
  params: Record<string, unknown>
): Promise<unknown> {
  logger.debug(`Executing built-in ability: ${abilityName}`, { params });

  const cookie = 'playground_auto_login_already_happened=1';

  // Parse ability name (format: wordpress/resource/action)
  const parts = abilityName.split('/');
  if (parts.length !== 3 || parts[0] !== 'wordpress') {
    throw new Error(`Invalid ability name: ${abilityName}. Expected format: wordpress/resource/action`);
  }

  const [, resource, action] = parts;

  // Handle different resources and actions
  switch (resource) {
    case 'posts':
      return await handlePostsAbility(wordpressUrl, action, params, cookie);
    case 'pages':
      return await handlePagesAbility(wordpressUrl, action, params, cookie);
    case 'site':
      return await handleSiteAbility(wordpressUrl, action, params, cookie);
    case 'plugins':
      return await handlePluginsAbility(wordpressUrl, action, params, cookie);
    case 'themes':
      return await handleThemesAbility(wordpressUrl, action, params, cookie);
    default:
      throw new Error(`Unknown resource: ${resource}`);
  }
}

async function handlePostsAbility(
  wordpressUrl: string,
  action: string,
  params: Record<string, unknown>,
  cookie: string
): Promise<unknown> {
  const baseUrl = `${wordpressUrl}/wp-json/wp/v2/posts`;

  switch (action) {
    case 'list': {
      const queryParams = new URLSearchParams();
      if (params.per_page) queryParams.set('per_page', String(params.per_page));
      if (params.page) queryParams.set('page', String(params.page));
      if (params.status) queryParams.set('status', String(params.status));

      const url = queryParams.toString() ? `${baseUrl}?${queryParams}` : baseUrl;
      const response = await fetch(url, {
        headers: { Cookie: cookie },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    }

    case 'create': {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify({
          title: params.title,
          content: params.content,
          status: params.status || 'draft',
          excerpt: params.excerpt,
        }),
      });

      if (!response.ok) {
        const error = await response.json() as { message?: string };
        throw new Error(`HTTP ${response.status}: ${error.message || response.statusText}`);
      }

      return await response.json();
    }

    case 'get': {
      const response = await fetch(`${baseUrl}/${params.id}`, {
        headers: { Cookie: cookie },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    }

    case 'update': {
      const body: Record<string, unknown> = {};
      if (params.title) body.title = params.title;
      if (params.content) body.content = params.content;
      if (params.status) body.status = params.status;

      const response = await fetch(`${baseUrl}/${params.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json() as { message?: string };
        throw new Error(`HTTP ${response.status}: ${error.message || response.statusText}`);
      }

      return await response.json();
    }

    case 'delete': {
      const queryParams = new URLSearchParams();
      if (params.force) queryParams.set('force', 'true');

      const url = queryParams.toString() ? `${baseUrl}/${params.id}?${queryParams}` : `${baseUrl}/${params.id}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { Cookie: cookie },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    }

    default:
      throw new Error(`Unknown action: ${action} for resource: posts`);
  }
}

async function handlePagesAbility(
  wordpressUrl: string,
  action: string,
  params: Record<string, unknown>,
  cookie: string
): Promise<unknown> {
  const baseUrl = `${wordpressUrl}/wp-json/wp/v2/pages`;

  switch (action) {
    case 'list': {
      const queryParams = new URLSearchParams();
      if (params.per_page) queryParams.set('per_page', String(params.per_page));
      if (params.page) queryParams.set('page', String(params.page));

      const url = queryParams.toString() ? `${baseUrl}?${queryParams}` : baseUrl;
      const response = await fetch(url, {
        headers: { Cookie: cookie },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    }

    case 'create': {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify({
          title: params.title,
          content: params.content,
          status: params.status || 'draft',
        }),
      });

      if (!response.ok) {
        const error = await response.json() as { message?: string };
        throw new Error(`HTTP ${response.status}: ${error.message || response.statusText}`);
      }

      return await response.json();
    }

    default:
      throw new Error(`Unknown action: ${action} for resource: pages`);
  }
}

async function handleSiteAbility(
  wordpressUrl: string,
  action: string,
  params: Record<string, unknown>,
  cookie: string
): Promise<unknown> {
  switch (action) {
    case 'info': {
      const response = await fetch(`${wordpressUrl}/wp-json`, {
        headers: { Cookie: cookie },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    }

    default:
      throw new Error(`Unknown action: ${action} for resource: site`);
  }
}

async function handlePluginsAbility(
  wordpressUrl: string,
  action: string,
  params: Record<string, unknown>,
  cookie: string
): Promise<unknown> {
  switch (action) {
    case 'list': {
      const queryParams = new URLSearchParams({ context: 'view' });
      if (params.status) queryParams.set('status', String(params.status));

      const response = await fetch(`${wordpressUrl}/wp-json/wp/v2/plugins?${queryParams}`, {
        headers: { Cookie: cookie },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    }

    default:
      throw new Error(`Unknown action: ${action} for resource: plugins`);
  }
}

async function handleThemesAbility(
  wordpressUrl: string,
  action: string,
  params: Record<string, unknown>,
  cookie: string
): Promise<unknown> {
  switch (action) {
    case 'list': {
      const queryParams = new URLSearchParams();
      if (params.status) queryParams.set('status', String(params.status));

      const url = queryParams.toString()
        ? `${wordpressUrl}/wp-json/wp/v2/themes?${queryParams}`
        : `${wordpressUrl}/wp-json/wp/v2/themes`;

      const response = await fetch(url, {
        headers: { Cookie: cookie },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    }

    default:
      throw new Error(`Unknown action: ${action} for resource: themes`);
  }
}
