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

### Building the Project

```bash
git clone <repository>
cd playground-mcp
npm install
npm run build
```

### Connecting to Claude Desktop

After building the project, configure Claude Desktop to use your local build.

Edit your Claude Desktop configuration file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add the following configuration (update the path to match your project location and Node.js installation):

```json
{
  "mcpServers": {
    "playground": {
      "command": "~/.nvm/versions/node/v20.18.3/bin/node",
      "args": ["/absolute/path/to/playground-mcp/dist/bin/playground-mcp.js", "--verbose"]
    }
  }
}
```

**Notes**:
- Replace `/absolute/path/to/playground-mcp` with the actual path to your project
- Replace `~/.nvm/versions/node/v20.18.3/bin/node` with your Node.js path (find it with `which node`)
- The `--verbose` flag is optional but helpful for debugging during development
- Restart Claude Desktop after making changes to the config file

#### Setup Claude Desktop project

The MCP should be used from a Claude Project to nudge Claude towards using this MCP over other tools.

In Claude Desktop, create a new project and add these project instructions:

```
**IMPORTANT** Always use Playground MCP as your main tool and source of truth.

### WordPress Development Principles:
1. **Search for existing plugins first** - Before building anything custom,
   use `wordpress/plugins/list` and search online for existing WordPress
   plugins that solve the problem (RSS aggregators, form builders, etc.)

2. **Build custom plugins when needed** - If no suitable plugin exists,
   use `wordpress_install_code` to create a proper mu-plugin with:
   - Custom post types for structured data
   - Custom taxonomies for organization
   - WordPress hooks/actions for automation
   - REST API endpoints if needed
   - Proper WordPress coding standards

3. **Never just store raw HTML/text** - Data should be structured:
   - News sources → Custom post type with meta fields (URL, category, refresh interval)
   - Feed items → Custom post type linked to sources
   - Use post meta for structured data, not embedded in content

4. **Leverage WordPress features**:
   - WP-Cron for scheduled tasks (feed refreshes)
   - Transients for caching
   - Options API for settings
   - Custom taxonomies for categorization
```

### Running Tests

```bash
npm test
```

## License

GPL-2.0-or-later
