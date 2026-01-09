<?php
/**
 * Plugin Name: WordPress CRUD Abilities for MCP
 * Description: Built-in WordPress CRUD operations exposed as MCP tools via Abilities API
 * Version: 1.0.0
 * Author: WordPress Playground MCP Server
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Register built-in WordPress CRUD abilities using the Abilities API
 *
 * These abilities will be automatically exposed as MCP tools by the MCP Adapter.
 * Using 'plugins_loaded' hook to ensure Abilities API plugin has loaded.
 */
add_action('plugins_loaded', function() {
    // Ensure Abilities API is available
    if (!function_exists('register_ability')) {
        error_log('WordPress CRUD Abilities: Abilities API not available');
        return;
    }

    // Register post creation ability
    register_ability('wordpress/posts/create', [
        'description' => 'Create a new WordPress post or custom post type',
        'callback' => function($params) {
            $post_data = [
                'post_title'   => sanitize_text_field($params['title'] ?? ''),
                'post_content' => wp_kses_post($params['content'] ?? ''),
                'post_status'  => isset($params['status']) ? $params['status'] : 'draft',
                'post_type'    => isset($params['post_type']) ? $params['post_type'] : 'post',
            ];

            if (isset($params['author_id'])) {
                $post_data['post_author'] = intval($params['author_id']);
            }

            if (isset($params['excerpt'])) {
                $post_data['post_excerpt'] = sanitize_text_field($params['excerpt']);
            }

            $post_id = wp_insert_post($post_data, true);

            if (is_wp_error($post_id)) {
                return [
                    'success' => false,
                    'error' => $post_id->get_error_message(),
                ];
            }

            // Set categories
            if (isset($params['categories']) && is_array($params['categories'])) {
                wp_set_post_categories($post_id, $params['categories']);
            }

            // Set tags
            if (isset($params['tags']) && is_array($params['tags'])) {
                wp_set_post_tags($post_id, $params['tags']);
            }

            $post = get_post($post_id);

            return [
                'success' => true,
                'post_id' => $post_id,
                'post' => [
                    'id' => $post->ID,
                    'title' => $post->post_title,
                    'content' => $post->post_content,
                    'excerpt' => $post->post_excerpt,
                    'status' => $post->post_status,
                    'type' => $post->post_type,
                    'url' => get_permalink($post_id),
                    'edit_url' => get_edit_post_link($post_id, 'raw'),
                    'date' => $post->post_date,
                ],
            ];
        },
        'input_schema' => [
            'type' => 'object',
            'properties' => [
                'post_type' => [
                    'type' => 'string',
                    'description' => 'Post type (post, page, or custom post type)',
                    'default' => 'post'
                ],
                'title' => [
                    'type' => 'string',
                    'description' => 'Post title'
                ],
                'content' => [
                    'type' => 'string',
                    'description' => 'Post content (HTML allowed)'
                ],
                'status' => [
                    'type' => 'string',
                    'enum' => ['publish', 'draft', 'pending', 'private'],
                    'description' => 'Post status',
                    'default' => 'draft'
                ],
                'author_id' => [
                    'type' => 'integer',
                    'description' => 'Author user ID (defaults to current user)',
                ],
                'excerpt' => [
                    'type' => 'string',
                    'description' => 'Post excerpt'
                ],
                'categories' => [
                    'type' => 'array',
                    'items' => ['type' => 'integer'],
                    'description' => 'Array of category IDs'
                ],
                'tags' => [
                    'type' => 'array',
                    'items' => ['type' => 'string'],
                    'description' => 'Array of tag names'
                ],
            ],
            'required' => ['title', 'content']
        ],
        'output_schema' => [
            'type' => 'object',
            'properties' => [
                'success' => ['type' => 'boolean'],
                'post_id' => ['type' => 'integer'],
                'post' => ['type' => 'object'],
                'error' => ['type' => 'string'],
            ],
        ],
    ]);

    // Register post listing ability
    register_ability('wordpress/posts/list', [
        'description' => 'List WordPress posts with filtering and pagination',
        'callback' => function($params) {
            $args = [
                'post_type' => isset($params['post_type']) ? $params['post_type'] : 'post',
                'post_status' => isset($params['status']) ? $params['status'] : 'any',
                'posts_per_page' => isset($params['per_page']) ? min(intval($params['per_page']), 100) : 10,
                'paged' => isset($params['page']) ? intval($params['page']) : 1,
                'order' => isset($params['order']) ? $params['order'] : 'DESC',
                'orderby' => isset($params['orderby']) ? $params['orderby'] : 'date',
            ];

            $query = new WP_Query($args);

            $posts = array_map(function($post) {
                return [
                    'id' => $post->ID,
                    'title' => $post->post_title,
                    'excerpt' => $post->post_excerpt,
                    'status' => $post->post_status,
                    'type' => $post->post_type,
                    'url' => get_permalink($post->ID),
                    'edit_url' => get_edit_post_link($post->ID, 'raw'),
                    'date' => $post->post_date,
                    'modified' => $post->post_modified,
                ];
            }, $query->posts);

            return [
                'success' => true,
                'posts' => $posts,
                'total' => $query->found_posts,
                'pages' => $query->max_num_pages,
                'current_page' => intval($args['paged']),
            ];
        },
        'input_schema' => [
            'type' => 'object',
            'properties' => [
                'post_type' => [
                    'type' => 'string',
                    'description' => 'Post type to query',
                    'default' => 'post'
                ],
                'status' => [
                    'type' => 'string',
                    'description' => 'Post status (publish, draft, any, etc.)',
                    'default' => 'any'
                ],
                'per_page' => [
                    'type' => 'integer',
                    'description' => 'Number of posts per page',
                    'default' => 10,
                    'maximum' => 100
                ],
                'page' => [
                    'type' => 'integer',
                    'description' => 'Page number',
                    'default' => 1
                ],
                'order' => [
                    'type' => 'string',
                    'enum' => ['ASC', 'DESC'],
                    'default' => 'DESC'
                ],
                'orderby' => [
                    'type' => 'string',
                    'description' => 'Order by field (date, title, modified, etc.)',
                    'default' => 'date'
                ],
            ],
        ],
        'output_schema' => [
            'type' => 'object',
            'properties' => [
                'success' => ['type' => 'boolean'],
                'posts' => ['type' => 'array'],
                'total' => ['type' => 'integer'],
                'pages' => ['type' => 'integer'],
                'current_page' => ['type' => 'integer'],
            ],
        ],
    ]);

    // Register post retrieval ability
    register_ability('wordpress/posts/get', [
        'description' => 'Get a single WordPress post by ID',
        'callback' => function($params) {
            $post_id = intval($params['post_id'] ?? 0);
            $post = get_post($post_id);

            if (!$post) {
                return [
                    'success' => false,
                    'error' => 'Post not found',
                ];
            }

            return [
                'success' => true,
                'post' => [
                    'id' => $post->ID,
                    'title' => $post->post_title,
                    'content' => $post->post_content,
                    'excerpt' => $post->post_excerpt,
                    'status' => $post->post_status,
                    'type' => $post->post_type,
                    'url' => get_permalink($post->ID),
                    'edit_url' => get_edit_post_link($post->ID, 'raw'),
                    'date' => $post->post_date,
                    'modified' => $post->post_modified,
                    'author_id' => $post->post_author,
                    'categories' => wp_get_post_categories($post->ID),
                    'tags' => wp_get_post_tags($post->ID, ['fields' => 'names']),
                ],
            ];
        },
        'input_schema' => [
            'type' => 'object',
            'properties' => [
                'post_id' => [
                    'type' => 'integer',
                    'description' => 'Post ID',
                ],
            ],
            'required' => ['post_id']
        ],
        'output_schema' => [
            'type' => 'object',
            'properties' => [
                'success' => ['type' => 'boolean'],
                'post' => ['type' => 'object'],
                'error' => ['type' => 'string'],
            ],
        ],
    ]);

    // Register post update ability
    register_ability('wordpress/posts/update', [
        'description' => 'Update an existing WordPress post',
        'callback' => function($params) {
            $post_id = intval($params['post_id'] ?? 0);

            if (!get_post($post_id)) {
                return [
                    'success' => false,
                    'error' => 'Post not found',
                ];
            }

            $post_data = ['ID' => $post_id];

            if (isset($params['title'])) {
                $post_data['post_title'] = sanitize_text_field($params['title']);
            }

            if (isset($params['content'])) {
                $post_data['post_content'] = wp_kses_post($params['content']);
            }

            if (isset($params['status'])) {
                $post_data['post_status'] = $params['status'];
            }

            if (isset($params['excerpt'])) {
                $post_data['post_excerpt'] = sanitize_text_field($params['excerpt']);
            }

            $result = wp_update_post($post_data, true);

            if (is_wp_error($result)) {
                return [
                    'success' => false,
                    'error' => $result->get_error_message(),
                ];
            }

            $post = get_post($post_id);

            return [
                'success' => true,
                'post_id' => $post_id,
                'post' => [
                    'id' => $post->ID,
                    'title' => $post->post_title,
                    'content' => $post->post_content,
                    'excerpt' => $post->post_excerpt,
                    'status' => $post->post_status,
                    'url' => get_permalink($post_id),
                    'modified' => $post->post_modified,
                ],
            ];
        },
        'input_schema' => [
            'type' => 'object',
            'properties' => [
                'post_id' => [
                    'type' => 'integer',
                    'description' => 'Post ID to update',
                ],
                'title' => [
                    'type' => 'string',
                    'description' => 'New post title'
                ],
                'content' => [
                    'type' => 'string',
                    'description' => 'New post content'
                ],
                'status' => [
                    'type' => 'string',
                    'enum' => ['publish', 'draft', 'pending', 'private'],
                    'description' => 'New post status',
                ],
                'excerpt' => [
                    'type' => 'string',
                    'description' => 'New post excerpt'
                ],
            ],
            'required' => ['post_id']
        ],
        'output_schema' => [
            'type' => 'object',
            'properties' => [
                'success' => ['type' => 'boolean'],
                'post_id' => ['type' => 'integer'],
                'post' => ['type' => 'object'],
                'error' => ['type' => 'string'],
            ],
        ],
    ]);

    // Register post deletion ability
    register_ability('wordpress/posts/delete', [
        'description' => 'Delete a WordPress post (move to trash or permanently delete)',
        'callback' => function($params) {
            $post_id = intval($params['post_id'] ?? 0);
            $force = isset($params['force']) ? (bool)$params['force'] : false;

            if (!get_post($post_id)) {
                return [
                    'success' => false,
                    'error' => 'Post not found',
                ];
            }

            $result = wp_delete_post($post_id, $force);

            if (!$result) {
                return [
                    'success' => false,
                    'error' => 'Failed to delete post',
                ];
            }

            return [
                'success' => true,
                'post_id' => $post_id,
                'deleted' => $force ? 'permanently' : 'moved to trash',
            ];
        },
        'input_schema' => [
            'type' => 'object',
            'properties' => [
                'post_id' => [
                    'type' => 'integer',
                    'description' => 'Post ID to delete',
                ],
                'force' => [
                    'type' => 'boolean',
                    'description' => 'Permanently delete (true) or move to trash (false)',
                    'default' => false
                ],
            ],
            'required' => ['post_id']
        ],
        'output_schema' => [
            'type' => 'object',
            'properties' => [
                'success' => ['type' => 'boolean'],
                'post_id' => ['type' => 'integer'],
                'deleted' => ['type' => 'string'],
                'error' => ['type' => 'string'],
            ],
        ],
    ]);

    // Register site info ability
    register_ability('wordpress/site/info', [
        'description' => 'Get WordPress site information',
        'callback' => function($params) {
            return [
                'success' => true,
                'site' => [
                    'name' => get_bloginfo('name'),
                    'description' => get_bloginfo('description'),
                    'url' => get_bloginfo('url'),
                    'admin_email' => get_bloginfo('admin_email'),
                    'wordpress_version' => get_bloginfo('version'),
                    'language' => get_bloginfo('language'),
                    'charset' => get_bloginfo('charset'),
                    'admin_url' => admin_url(),
                    'home_url' => home_url(),
                ],
            ];
        },
        'input_schema' => [
            'type' => 'object',
            'properties' => [],
        ],
        'output_schema' => [
            'type' => 'object',
            'properties' => [
                'success' => ['type' => 'boolean'],
                'site' => ['type' => 'object'],
            ],
        ],
    ]);

    error_log('WordPress CRUD Abilities: 6 abilities registered successfully');
});
