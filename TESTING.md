# Testing Instructions

This document provides instructions for testing the playground-mcp server.

## Prerequisites

- Node.js 20.18 or higher
- npm

## Setup

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

## Manual Testing

### 1. Test CLI Help

```bash
node dist/bin/playground-mcp.js --help
```

Expected output: Help message showing available options.

```bash
node dist/bin/playground-mcp.js --version
```

Expected output: `playground-mcp v0.1.0`

### 2. Test MCP Protocol (tools/list)

Test that the server responds to MCP protocol messages:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node dist/bin/playground-mcp.js 2>/dev/null
```

Expected: JSON response with server capabilities.

After initialization, test tools/list:

```bash
# Create a test script that sends both messages
cat << 'EOF' | node dist/bin/playground-mcp.js 2>/dev/null
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
EOF
```

Expected: JSON response listing 7 tools:
- `playground_spawn`
- `playground_destroy`
- `playground_list`
- `playground_status`
- `wordpress_discover`
- `wordpress_execute`
- `wordpress_install_code`

### 3. Test playground_list (Empty State)

```bash
cat << 'EOF' | node dist/bin/playground-mcp.js 2>/dev/null
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"playground_list","arguments":{}}}
EOF
```

Expected: Response showing `{"count": 0, "instances": []}`.

### 4. Test playground_spawn

**Note:** This test spawns a real WordPress Playground instance and may take 30-90 seconds.

```bash
cat << 'EOF' | timeout 120 node dist/bin/playground-mcp.js --verbose 2>&1
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"playground_spawn","arguments":{"name":"test-instance"}}}
EOF
```

Expected response includes:
- `instance_id`: A unique identifier
- `name`: "test-instance"
- `web_url`: URL like `http://localhost:9401`
- `mcp_endpoint`: URL for the MCP adapter
- `admin_url`: WordPress admin URL
- `status`: "running"

### 5. Test Instance Access

After spawning, verify the instance is accessible:

```bash
# Replace 9401 with the actual port from spawn response
curl -s http://localhost:9401/ | head -20
```

Expected: HTML response from WordPress.

### 6. Test playground_status

```bash
# Replace INSTANCE_ID with the actual ID from spawn
cat << 'EOF' | node dist/bin/playground-mcp.js 2>/dev/null
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"playground_status","arguments":{"instance_id":"INSTANCE_ID"}}}
EOF
```

### 7. Test playground_destroy

```bash
# Replace INSTANCE_ID with the actual ID
cat << 'EOF' | node dist/bin/playground-mcp.js 2>/dev/null
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"playground_destroy","arguments":{"instance_id":"INSTANCE_ID"}}}
EOF
```

Expected: Success message confirming instance destruction.

## Testing with MCP Inspector

Use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) for interactive testing:

```bash
npx @modelcontextprotocol/inspector node dist/bin/playground-mcp.js
```

This opens a web UI where you can:
1. View all registered tools
2. Execute tools with custom arguments
3. See responses in real-time

## Testing with Claude Desktop

1. Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "playground": {
      "command": "node",
      "args": ["/absolute/path/to/dist/bin/playground-mcp.js", "--verbose"]
    }
  }
}
```

2. Restart Claude Desktop
3. Ask Claude to:
   - "Create a new WordPress playground"
   - "List all playground instances"
   - "What WordPress abilities are available?"

## Integration Test Script

Create and run this test script:

```bash
#!/bin/bash
# test-integration.sh

set -e

echo "=== Building project ==="
npm run build

echo ""
echo "=== Testing CLI help ==="
node dist/bin/playground-mcp.js --help | head -5

echo ""
echo "=== Testing tools/list ==="
RESPONSE=$(cat << 'EOF' | node dist/bin/playground-mcp.js 2>/dev/null
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
EOF
)

# Check if response contains expected tools
if echo "$RESPONSE" | grep -q "playground_spawn"; then
    echo "✓ tools/list returns playground_spawn"
else
    echo "✗ tools/list missing playground_spawn"
    exit 1
fi

if echo "$RESPONSE" | grep -q "wordpress_discover"; then
    echo "✓ tools/list returns wordpress_discover"
else
    echo "✗ tools/list missing wordpress_discover"
    exit 1
fi

echo ""
echo "=== Testing playground_list (empty) ==="
RESPONSE=$(cat << 'EOF' | node dist/bin/playground-mcp.js 2>/dev/null
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"playground_list","arguments":{}}}
EOF
)

if echo "$RESPONSE" | grep -q '"count": 0'; then
    echo "✓ playground_list returns empty list"
else
    echo "✗ playground_list should return empty list"
    exit 1
fi

echo ""
echo "=== All tests passed ==="
```

## Error Scenarios to Test

### 1. Invalid Instance ID

```bash
cat << 'EOF' | node dist/bin/playground-mcp.js 2>/dev/null
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"playground/status","arguments":{"instance_id":"nonexistent"}}}
EOF
```

Expected: Error response with "Instance nonexistent not found".

### 2. Missing Required Arguments

```bash
cat << 'EOF' | node dist/bin/playground-mcp.js 2>/dev/null
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"playground_destroy","arguments":{}}}
EOF
```

Expected: Zod validation error for missing `instance_id`.

### 3. Unknown Tool

```bash
cat << 'EOF' | node dist/bin/playground-mcp.js 2>/dev/null
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"unknown/tool","arguments":{}}}
EOF
```

Expected: Error response indicating unknown tool.

## Verbose Logging

Run with `--verbose` flag to see detailed logs:

```bash
node dist/bin/playground-mcp.js --verbose
```

Logs are written to stderr to avoid interfering with the MCP protocol on stdout.

## Cleanup

After testing, ensure all spawned instances are destroyed:

```bash
# Kill any remaining playground processes
pkill -f "wp-playground" || true

# Remove data directory
rm -rf ~/.playground-mcp
```

## Known Limitations

1. **Plugin Installation**: The default blueprint attempts to install Abilities API and MCP Adapter plugins from GitHub releases. These URLs may not be available yet.

2. **wordpress_discover and wordpress_execute**: These tools require the MCP Adapter plugin to be properly installed and configured on the Playground instance.

3. **wordpress_install_code**: Falls back to manual instructions if the `core/run-php` ability is not available.
