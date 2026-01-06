# playground-mcp

MCP server for orchestrating WordPress Playground instances. Enables AI agents to spawn, manage, and interact with sandboxed WordPress environments.

## Features

- **Spawn WordPress instances** on demand with configurable PHP/WP versions
- **Pre-installed WordPress Abilities API** and MCP Adapter
- **Discover and execute** WordPress abilities via MCP
- **Install custom code** dynamically
- **Multi-instance management** with automatic cleanup

## Requirements

- Node.js 20.18 or higher
- npm or npx

## Quick Start

### With npx (no installation)

Configure your MCP client (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "playground": {
      "command": "npx",
      "args": ["playground-mcp"]
    }
  }
}
```

### Global Installation

```bash
npm install -g playground-mcp
```

Then configure:

```json
{
  "mcpServers": {
    "playground": {
      "command": "playground-mcp"
    }
  }
}
```

## Available Tools

### Playground Management

| Tool | Description |
|------|-------------|
| `playground_spawn` | Create a new WordPress Playground instance |
| `playground_destroy` | Stop and remove an instance |
| `playground_list` | List all running instances |
| `playground_status` | Get detailed status of an instance |
| `playground_verify` | Verify instance is fully operational and ready for WordPress operations |

### WordPress Interaction

| Tool | Description |
|------|-------------|
| `wordpress_discover` | List available WordPress abilities on an instance |
| `wordpress_execute` | Execute a WordPress ability |
| `wordpress_install_code` | Install custom PHP code as a mu-plugin |

## Example Usage

Once configured, you can ask your AI assistant:

> "Create a new WordPress playground and show me what abilities are available"

> "Install a plugin that adds a custom post type for recipes"

> "Create a blog post about AI and WordPress"

## CLI Options

```
playground-mcp [OPTIONS]

--data-dir=<path>       Directory for instance data (default: ~/.playground-mcp)
--start-port=<port>     Starting port for instances (default: 9401)
--max-instances=<n>     Maximum concurrent instances (default: 10)
-v, --verbose           Enable verbose logging
-h, --help              Show help
--version               Show version
```

## How It Works

1. **playground-mcp** runs as an MCP server, communicating via STDIO
2. When you spawn an instance, it uses `@wp-playground/cli` to start WordPress
3. Each instance has the **Abilities API** and **MCP Adapter** pre-installed
4. The **wordpress_*** tools proxy requests to the instance's MCP Adapter
5. This allows AI to discover and use any registered WordPress ability

## Architecture

```
+-----------------------------------------------------------+
|                     AI Clients                            |
|       (Claude Desktop, Cursor, VS Code, etc.)             |
+---------------------------+-------------------------------+
                            | MCP Protocol (STDIO)
                            v
+-----------------------------------------------------------+
|              playground-mcp (this project)                |
|  +-----------------------------------------------------+  |
|  |  Orchestrator                                       |  |
|  |  - Spawns/destroys Playground instances             |  |
|  |  - Tracks instance lifecycle                        |  |
|  |  - Routes requests to correct instance              |  |
|  +-----------------------------------------------------+  |
+---------------------------+-------------------------------+
                            | HTTP (localhost)
                            v
+-----------------------------------------------------------+
|                  Playground Instances                     |
|  +--------------+  +--------------+  +--------------+     |
|  | Instance A   |  | Instance B   |  | Instance C   |     |
|  | :9401        |  | :9402        |  | :9403        |     |
|  | WordPress +  |  | WordPress +  |  | WordPress +  |     |
|  | Abilities +  |  | Abilities +  |  | Abilities +  |     |
|  | MCP Adapter  |  | MCP Adapter  |  | MCP Adapter  |     |
|  +--------------+  +--------------+  +--------------+     |
+-----------------------------------------------------------+
```

## Development

```bash
git clone <repository>
cd playground-mcp
npm install
npm run build
npm start
```

## License

GPL-2.0-or-later
