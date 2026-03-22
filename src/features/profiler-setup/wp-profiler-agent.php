<?php
/**
 * Plugin Name: WP Profiler Agent
 * Description: Auto-installed by WordPress Supercharged addon. Collects XHProf
 *              profiling data per request when triggered by the X-Profile-Request header.
 *              Zero overhead on normal requests.
 *
 * This file is the canonical copy stored at ~/.wp-profiler/mu-plugin/ and symlinked
 * into each site's wp-content/mu-plugins/. Do not edit the symlinked copy.
 */

// -------------------------------------------------------------------------
// Early exit: only activate when the profiling header is present.
// This ensures zero overhead on normal requests.
// -------------------------------------------------------------------------

if (empty($_SERVER['HTTP_X_PROFILE_REQUEST'])) {
	return;
}

// -------------------------------------------------------------------------
// Start profiling as early as possible.
// MU-plugins load before regular plugins and themes in wp-settings.php,
// so xhprof_enable() here captures all plugin/theme initialization code.
// -------------------------------------------------------------------------

if (function_exists('xhprof_enable')) {
	xhprof_enable(XHPROF_FLAGS_CPU | XHPROF_FLAGS_MEMORY);
} elseif (function_exists('tideways_xhprof_enable')) {
	tideways_xhprof_enable(TIDEWAYS_XHPROF_FLAGS_CPU | TIDEWAYS_XHPROF_FLAGS_MEMORY);
} else {
	return;
}

// -------------------------------------------------------------------------
// Capture query arguments for get_posts / WP_Query calls.
// Hooks into pre_get_posts to record the query vars before execution.
// -------------------------------------------------------------------------

$GLOBALS['_wp_profiler_query_log'] = array();

add_action('pre_get_posts', function ($query) {
	$trace = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 10);
	$caller = '';
	foreach ($trace as $frame) {
		if (!empty($frame['file']) && strpos($frame['file'], 'wp-content/') !== false) {
			$caller = $frame['file'] . ':' . (isset($frame['line']) ? $frame['line'] : '?');
			break;
		}
	}

	$GLOBALS['_wp_profiler_query_log'][] = array(
		'caller'         => $caller,
		'posts_per_page' => $query->get('posts_per_page'),
		'post_type'      => $query->get('post_type'),
		'is_main_query'  => $query->is_main_query(),
	);
}, 1);

// -------------------------------------------------------------------------
// Register REST endpoints for retrieving profiling data.
// -------------------------------------------------------------------------

add_action('rest_api_init', function () {
	register_rest_route('profiler/v1', '/runs', array(
		'methods'             => 'GET',
		'callback'            => 'wp_profiler_list_runs',
		'permission_callback' => '__return_true',
	));

	register_rest_route('profiler/v1', '/runs/(?P<run_id>[a-zA-Z0-9_-]+)', array(
		'methods'             => 'GET',
		'callback'            => 'wp_profiler_get_run',
		'permission_callback' => '__return_true',
	));
});

/**
 * Lists available profiling run IDs.
 * Each run is a subdirectory under wp-content/profiler-runs/.
 */
function wp_profiler_list_runs() {
	$base = WP_CONTENT_DIR . '/profiler-runs';
	if (!is_dir($base)) {
		return new WP_REST_Response(array('runs' => array()), 200);
	}

	$runs = array();
	foreach (scandir($base) as $entry) {
		if ($entry === '.' || $entry === '..') continue;
		if (!is_dir($base . '/' . $entry)) continue;

		$files = glob($base . '/' . $entry . '/*.json');
		$runs[] = array(
			'run_id'        => $entry,
			'request_count' => count($files),
		);
	}

	return new WP_REST_Response(array('runs' => $runs), 200);
}

/**
 * Returns aggregated profiling data for a specific run.
 * Reads all JSON files from the run's directory and merges them.
 */
function wp_profiler_get_run($request) {
	$run_id = $request->get_param('run_id');
	$run_dir = WP_CONTENT_DIR . '/profiler-runs/' . $run_id;

	if (!is_dir($run_dir)) {
		return new WP_Error('not_found', 'Run not found', array('status' => 404));
	}

	$files = glob($run_dir . '/*.json');
	$requests = array();

	foreach ($files as $file) {
		$data = json_decode(file_get_contents($file), true);
		if ($data) {
			$requests[] = $data;
		}
	}

	return new WP_REST_Response(array(
		'run_id'   => $run_id,
		'requests' => $requests,
	), 200);
}

// -------------------------------------------------------------------------
// Collect profiling data on shutdown.
// Uses register_shutdown_function() instead of the WordPress 'shutdown'
// hook because it fires even on fatal errors.
// -------------------------------------------------------------------------

register_shutdown_function(function () {
	// Stop profiling
	if (function_exists('xhprof_disable')) {
		$profile_data = xhprof_disable();
	} elseif (function_exists('tideways_xhprof_disable')) {
		$profile_data = tideways_xhprof_disable();
	} else {
		return;
	}

	if (empty($profile_data)) {
		return;
	}

	// Determine run and request IDs from headers
	$run_id = isset($_SERVER['HTTP_X_RUN_ID'])
		? preg_replace('/[^a-zA-Z0-9_-]/', '', $_SERVER['HTTP_X_RUN_ID'])
		: 'default';
	$request_id = isset($_SERVER['HTTP_X_REQUEST_ID'])
		? preg_replace('/[^a-zA-Z0-9_.-]/', '', $_SERVER['HTTP_X_REQUEST_ID'])
		: uniqid('req_', true);

	// Collect request metadata
	global $wpdb;

	$meta = array(
		'run_id'      => $run_id,
		'request_id'  => $request_id,
		'url'         => isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '/',
		'method'      => isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET',
		'timestamp'   => microtime(true),
		'memory_peak' => memory_get_peak_usage(true),
		'queries'     => isset($wpdb->num_queries) ? $wpdb->num_queries : 0,
	);

	// Capture slow queries if SAVEQUERIES is enabled
	if (defined('SAVEQUERIES') && SAVEQUERIES && !empty($wpdb->queries)) {
		$total_query_time = 0;
		$slow_queries = array();

		foreach ($wpdb->queries as $query) {
			$total_query_time += $query[1];
			if ($query[1] > 0.01) {
				$slow_queries[] = array(
					'sql'     => substr($query[0], 0, 200),
					'time_ms' => round($query[1] * 1000, 2),
					'caller'  => $query[2],
				);
			}
		}

		$meta['total_query_time_ms'] = round($total_query_time * 1000, 2);
		$meta['slow_queries'] = array_slice($slow_queries, 0, 20);
	}

	// Count hooks fired
	if (!empty($GLOBALS['wp_filter'])) {
		$meta['hooks_fired'] = count($GLOBALS['wp_filter']);
	}

	// -------------------------------------------------------------------------
	// Call-site attribution: resolve function file paths via Reflection,
	// then classify each as plugin, theme, mu-plugin, or core.
	// -------------------------------------------------------------------------

	$file_map = wp_profiler_resolve_function_files($profile_data);

	// Build attributed call list for expensive functions
	$calls = wp_profiler_attribute_calls($profile_data, $file_map);

	// Attach captured query args
	$query_log = isset($GLOBALS['_wp_profiler_query_log'])
		? $GLOBALS['_wp_profiler_query_log']
		: array();

	$output = array(
		'run_id'     => $run_id,
		'request_id' => $request_id,
		'meta'       => $meta,
		'calls'      => $calls,
		'query_log'  => $query_log,
		'profile'    => $profile_data,
	);

	// Write to wp-content/profiler-runs/{run_id}/{request_id}.json
	$dir = WP_CONTENT_DIR . '/profiler-runs/' . $run_id;
	if (!is_dir($dir)) {
		@mkdir($dir, 0755, true);
	}

	@file_put_contents($dir . '/' . $request_id . '.json', json_encode($output));
});

// -------------------------------------------------------------------------
// Helper functions
// -------------------------------------------------------------------------

/**
 * Resolves function/method names to their file paths using Reflection.
 */
function wp_profiler_resolve_function_files($profile_data) {
	$file_map = array();
	$seen = array();

	foreach ($profile_data as $key => $stats) {
		$parts = explode('==>', $key);
		foreach ($parts as $func_name) {
			$func_name = preg_replace('/@\d+$/', '', $func_name);
			if (isset($seen[$func_name])) continue;
			$seen[$func_name] = true;

			$info = wp_profiler_get_function_file($func_name);
			if ($info) {
				$file_map[$func_name] = $info;
			}
		}
	}

	return $file_map;
}

/**
 * Gets the file path and line number for a function or method.
 */
function wp_profiler_get_function_file($func_name) {
	try {
		if (strpos($func_name, '::') !== false) {
			list($class, $method) = explode('::', $func_name, 2);
			if (!class_exists($class, false)) return null;
			$ref = new ReflectionMethod($class, $method);
		} elseif (function_exists($func_name)) {
			$ref = new ReflectionFunction($func_name);
		} else {
			return null;
		}

		$file = $ref->getFileName();
		if (!$file) return null;

		return array(
			'file' => $file,
			'line' => $ref->getStartLine(),
		);
	} catch (Exception $e) {
		return null;
	} catch (Error $e) {
		return null;
	}
}

/**
 * Classifies a file path as plugin, theme, mu-plugin, or core.
 */
function wp_profiler_classify_file($file_path) {
	if (!$file_path) return null;

	if (preg_match('#[/\\\\]wp-content[/\\\\]plugins[/\\\\]([^/\\\\]+)#', $file_path, $m)) {
		return array('type' => 'plugin', 'name' => $m[1]);
	}

	if (preg_match('#[/\\\\]wp-content[/\\\\]mu-plugins[/\\\\]([^/\\\\]+)#', $file_path, $m)) {
		return array('type' => 'mu-plugin', 'name' => preg_replace('/\.php$/', '', $m[1]));
	}

	if (preg_match('#[/\\\\]wp-content[/\\\\]themes[/\\\\]([^/\\\\]+)#', $file_path, $m)) {
		return array('type' => 'theme', 'name' => $m[1]);
	}

	if (preg_match('#[/\\\\]wp-(includes|admin)[/\\\\]#', $file_path)) {
		return array('type' => 'core', 'name' => 'wordpress');
	}

	return null;
}

/**
 * Builds a caller lookup from the XHProf call graph.
 *
 * XHProf data keys are "caller==>callee". This builds a map from each
 * function to its callers, so we can walk UP the call chain to find
 * the plugin/theme code that initiated any given call.
 *
 * Returns: array( 'funcName' => array('caller1', 'caller2', ...) )
 */
function wp_profiler_build_caller_map($profile_data) {
	$callers = array();

	foreach ($profile_data as $key => $stats) {
		$parts = explode('==>', $key);
		if (count($parts) !== 2) continue;

		$caller = preg_replace('/@\d+$/', '', $parts[0]);
		$callee = preg_replace('/@\d+$/', '', $parts[1]);

		if (!isset($callers[$callee])) {
			$callers[$callee] = array();
		}
		$callers[$callee][] = $caller;
	}

	return $callers;
}

/**
 * Walks UP the call chain from a given function to find the first
 * ancestor whose file is inside wp-content/plugins/ or wp-content/themes/.
 *
 * Returns the classification + file info of the first wp-content ancestor,
 * or null if the entire chain is core/internal.
 */
function wp_profiler_find_wp_content_ancestor($func_name, $caller_map, $file_map, $depth = 0) {
	// Prevent infinite recursion
	if ($depth > 20) return null;

	if (!isset($caller_map[$func_name])) return null;

	foreach ($caller_map[$func_name] as $caller) {
		// Check if this caller is in wp-content
		if (isset($file_map[$caller])) {
			$cls = wp_profiler_classify_file($file_map[$caller]['file']);
			if ($cls && ($cls['type'] === 'plugin' || $cls['type'] === 'theme')) {
				return array(
					'classification' => $cls,
					'info' => $file_map[$caller],
				);
			}
		}

		// Keep walking up
		$ancestor = wp_profiler_find_wp_content_ancestor($caller, $caller_map, $file_map, $depth + 1);
		if ($ancestor) return $ancestor;
	}

	return null;
}

/**
 * Attributes all expensive function calls to the plugin/theme that
 * initiated them.
 *
 * For each function call in the XHProf data:
 * 1. If the function itself is in wp-content/plugins or wp-content/themes,
 *    attribute it directly.
 * 2. If the function is core/internal, walk UP the call chain to find
 *    the nearest plugin/theme ancestor that triggered the call.
 * 3. If no wp-content ancestor is found, skip the entry entirely.
 *
 * This ensures the report only shows time spent by plugin/theme code.
 */
function wp_profiler_attribute_calls($profile_data, $file_map) {
	$caller_map = wp_profiler_build_caller_map($profile_data);
	$calls = array();

	foreach ($profile_data as $key => $stats) {
		$parts = explode('==>', $key);
		$callee = end($parts);
		$callee_clean = preg_replace('/@\d+$/', '', $callee);

		// Skip trivial calls (less than 1ms wall time)
		if (!isset($stats['wt']) || $stats['wt'] < 1000) {
			continue;
		}

		$attribution = null;

		// First: check if the callee itself is in wp-content
		if (isset($file_map[$callee_clean])) {
			$cls = wp_profiler_classify_file($file_map[$callee_clean]['file']);
			if ($cls && ($cls['type'] === 'plugin' || $cls['type'] === 'theme')) {
				$attribution = array(
					'classification' => $cls,
					'info' => $file_map[$callee_clean],
				);
			}
		}

		// Second: if callee is not in wp-content, walk up the call chain
		if (!$attribution) {
			$attribution = wp_profiler_find_wp_content_ancestor($callee_clean, $caller_map, $file_map);
		}

		// Skip if no wp-content code is responsible
		if (!$attribution) {
			continue;
		}

		$cls = $attribution['classification'];
		$info = $attribution['info'];

		// Skip our own profiler mu-plugin
		if ($cls['type'] === 'mu-plugin'
			&& $cls['name'] === 'wp-profiler-agent') {
			continue;
		}

		// Skip mu-plugins entirely -- only plugins and themes
		if ($cls['type'] === 'mu-plugin') {
			continue;
		}

		$call = array(
			'function'              => $callee_clean,
			'caller_type'           => $cls['type'],
			'caller_name'           => $cls['name'],
			'caller_file'           => isset($info['file']) ? $info['file'] : null,
			'caller_line'           => isset($info['line']) ? $info['line'] : null,
			'call_count'            => isset($stats['ct']) ? $stats['ct'] : 1,
			'inclusive_wall_time_us' => isset($stats['wt']) ? $stats['wt'] : 0,
			'inclusive_cpu_us'       => isset($stats['cpu']) ? $stats['cpu'] : 0,
			'inclusive_memory_bytes' => isset($stats['mu']) ? $stats['mu'] : 0,
			'peak_memory_bytes'     => isset($stats['pmu']) ? $stats['pmu'] : 0,
		);

		// Flag known bad patterns
		$call['patterns'] = wp_profiler_detect_patterns($callee_clean, $stats);

		$calls[] = $call;
	}

	// Sort by wall time descending
	usort($calls, function ($a, $b) {
		return $b['inclusive_wall_time_us'] - $a['inclusive_wall_time_us'];
	});

	return $calls;
}

/**
 * Detects known bad patterns in a function call.
 */
function wp_profiler_detect_patterns($func_name, $stats) {
	$patterns = array();

	// External HTTP calls
	if (in_array($func_name, array(
		'wp_remote_get', 'wp_remote_post', 'wp_remote_request',
		'wp_remote_head', 'WP_Http::request',
	))) {
		$patterns[] = 'EXT_HTTP';
	}

	// Excessive option reads
	if ($func_name === 'get_option' && isset($stats['ct']) && $stats['ct'] > 10) {
		$patterns[] = 'EXCESS_READS';
	}

	return $patterns;
}
