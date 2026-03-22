<?php
/**
 * Plugin Name: WP Conflict Tester
 * Description: Overrides active_plugins via filter for conflict testing.
 *              Does not modify the database. Controlled by the WordPress
 *              Supercharged addon's Conflict Testing panel.
 */

$override_file = WP_CONTENT_DIR . '/conflict-test-overrides.json';
if ( ! file_exists( $override_file ) ) {
	return;
}

$config = json_decode( file_get_contents( $override_file ), true );
if ( empty( $config['overrides'] ) ) {
	return;
}

add_filter( 'option_active_plugins', function ( $plugins ) use ( $config ) {
	foreach ( $config['overrides'] as $plugin_basename => $should_be_active ) {
		$index = array_search( $plugin_basename, $plugins, true );

		if ( $should_be_active && $index === false ) {
			// Force-activate: add to the list
			$plugins[] = $plugin_basename;
		} elseif ( ! $should_be_active && $index !== false ) {
			// Force-deactivate: remove from the list
			unset( $plugins[ $index ] );
		}
	}

	return array_values( $plugins );
} );
