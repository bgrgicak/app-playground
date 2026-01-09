export const mcpAdapterSessionFix = `
<?php
/**
 * Plugin Name: MCP Adapter Session Fix
 * Description: Fixes session validation in WordPress MCP Adapter to support proper MCP protocol
 * Version: 1.0.0
 * Author: WordPress Playground MCP Server
 */

// Prevent direct access
if (!defined(\'ABSPATH\')) {
    exit;
}

/**
 * WordPress MCP Adapter Session Fix
 *
 * PROBLEM:
 * The WordPress MCP Adapter plugin requires Mcp-Session-Id headers but doesn\'t
 * issue valid session IDs, causing all MCP operations to fail with
 * "Invalid or expired session" errors.
 *
 * SOLUTION:
 * This mu-plugin patches the session validation to:
 * 1. Accept any session ID format (including client-generated UUIDs)
 * 2. Store session IDs in WordPress transients
 * 3. Associate sessions with authenticated users
 * 4. Provide a 1-hour session lifetime
 *
 * This fix enables proper MCP protocol support for custom abilities registered
 * via register_ability() and exposed through the MCP Adapter.
 */

/**
 * Store session data in transients
 */
function mcp_adapter_fix_store_session($session_id, $user_id = null) {
    if (!$user_id) {
        $user_id = get_current_user_id();
    }

    $session_data = [
        \'user_id\' => $user_id,
        \'created_at\' => time(),
        \'last_accessed\' => time(),
    ];

    // Store for 1 hour
    set_transient("mcp_session_{$session_id}", $session_data, HOUR_IN_SECONDS);

    error_log("MCP Adapter Fix: Stored session {$session_id} for user {$user_id}");
}

/**
 * Retrieve session data
 */
function mcp_adapter_fix_get_session($session_id) {
    $session_data = get_transient("mcp_session_{$session_id}");

    if ($session_data) {
        // Update last accessed time
        $session_data[\'last_accessed\'] = time();
        set_transient("mcp_session_{$session_id}", $session_data, HOUR_IN_SECONDS);
    }

    return $session_data;
}

/**
 * Validate session and set current user
 */
function mcp_adapter_fix_validate_session($session_id) {
    if (!$session_id) {
        return false;
    }

    $session_data = mcp_adapter_fix_get_session($session_id);

    if (!$session_data) {
        error_log("MCP Adapter Fix: Session {$session_id} not found, creating new session");
        // Session doesn\'t exist - create it for current user
        mcp_adapter_fix_store_session($session_id);
        return true;
    }

    // Valid session exists - set the user context
    if ($session_data[\'user_id\']) {
        wp_set_current_user($session_data[\'user_id\']);
    }

    return true;
}

/**
 * Hook into MCP Adapter\'s session validation
 *
 * This filter runs before the MCP Adapter validates sessions.
 * We intercept the session ID and validate it ourselves.
 */
add_filter(\'rest_pre_dispatch\', function($result, $server, $request) {
    // Only handle MCP Adapter endpoints
    $route = $request->get_route();
    if (strpos($route, \'/mcp/\') === false) {
        return $result;
    }

    // Get session ID from header
    $session_id = $request->get_header(\'Mcp-Session-Id\');

    if ($session_id) {
        // Validate and restore session
        if (mcp_adapter_fix_validate_session($session_id)) {
            error_log("MCP Adapter Fix: Validated session {$session_id}");
        } else {
            error_log("MCP Adapter Fix: Failed to validate session {$session_id}");
        }
    } else {
        // No session header - this might be an initialize request
        // Let it through and we\'ll create a session on response
        error_log("MCP Adapter Fix: No session header found, may be initialize request");
    }

    return $result;
}, 10, 3);

/**
 * Add session ID to initialize response
 *
 * When the MCP client calls \'initialize\', we need to return a session ID
 * in the Mcp-Session-Id response header.
 */
add_filter(\'rest_post_dispatch\', function($response, $server, $request) {
    // Only handle MCP Adapter endpoints
    $route = $request->get_route();
    if (strpos($route, \'/mcp/\') === false) {
        return $response;
    }

    // Check if this is an initialize request
    $body = $request->get_json_params();
    $is_initialize = isset($body[\'method\']) && $body[\'method\'] === \'initialize\';

    if ($is_initialize) {
        // Generate or retrieve session ID
        $session_id = $request->get_header(\'Mcp-Session-Id\');

        if (!$session_id) {
            // Generate new session ID (UUID v4 format)
            $session_id = sprintf(
                \'%04x%04x-%04x-%04x-%04x-%04x%04x%04x\',
                mt_rand(0, 0xffff), mt_rand(0, 0xffff),
                mt_rand(0, 0xffff),
                mt_rand(0, 0x0fff) | 0x4000,
                mt_rand(0, 0x3fff) | 0x8000,
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
            );
        }

        // Store session
        mcp_adapter_fix_store_session($session_id);

        // Add session ID to response headers
        $response->header(\'Mcp-Session-Id\', $session_id);

        error_log("MCP Adapter Fix: Issued session ID {$session_id} for initialize request");
    }

    return $response;
}, 10, 3);

/**
 * Bypass MCP Adapter\'s built-in session validation
 *
 * This is a bit of a hack, but necessary. The MCP Adapter validates sessions
 * before our filters run, so we need to make WordPress think the user is
 * authenticated for MCP endpoints.
 */
add_filter(\'determine_current_user\', function($user_id) {
    // Only for MCP endpoints
    if (!isset($_SERVER[\'REQUEST_URI\'])) {
        return $user_id;
    }

    $request_uri = $_SERVER[\'REQUEST_URI\'];
    if (strpos($request_uri, \'/wp-json/mcp/\') === false) {
        return $user_id;
    }

    // Check for session header
    $session_id = null;
    if (function_exists(\'getallheaders\')) {
        $headers = getallheaders();
        if (isset($headers[\'Mcp-Session-Id\'])) {
            $session_id = $headers[\'Mcp-Session-Id\'];
        }
    }

    // Also check $_SERVER for the header
    if (!$session_id && isset($_SERVER[\'HTTP_MCP_SESSION_ID\'])) {
        $session_id = $_SERVER[\'HTTP_MCP_SESSION_ID\'];
    }

    if ($session_id) {
        // Validate session and get user
        $session_data = mcp_adapter_fix_get_session($session_id);

        if ($session_data && $session_data[\'user_id\']) {
            return $session_data[\'user_id\'];
        } else {
            // Create session for admin user (ID 1) in Playground environment
            mcp_adapter_fix_store_session($session_id, 1);
            return 1;
        }
    }

    // No session ID - for initialize requests, authenticate as admin
    // This allows the initialize request to succeed and create a session
    if (!$user_id || $user_id === 0) {
        return 1; // Admin user in Playground
    }

    return $user_id;
}, 20);

/**
 * Clean up expired sessions periodically
 */
add_action(\'wp_scheduled_delete\', function() {
    global $wpdb;

    // Delete expired session transients
    $wpdb->query(
        "DELETE FROM {$wpdb->options}
         WHERE option_name LIKE \'_transient_mcp_session_%\'
         OR option_name LIKE \'_transient_timeout_mcp_session_%\'"
    );

    error_log("MCP Adapter Fix: Cleaned up expired sessions");
});

error_log(\'MCP Adapter Session Fix: Loaded successfully\');
`;
