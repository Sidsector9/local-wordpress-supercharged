/**
 * DebugSwitches.tsx — React component for toggling WordPress debug constants.
 *
 * Exports a factory function (`createDebugSwitches`) that accepts a React
 * instance and returns the component. This factory pattern is necessary because
 * Local provides its own React instance via `context.React`, and we must use
 * that rather than importing React directly (version mismatch risk).
 *
 * The component renders three toggle switches (WP_DEBUG, WP_DEBUG_LOG,
 * WP_DEBUG_DISPLAY), each in a TableListRow. It handles:
 *   - Initial fetch from the main process
 *   - Optimistic UI updates with rollback on failure
 *   - Per-switch disabled state during writes
 *   - Real-time updates when wp-config.php is modified externally
 *   - File watcher lifecycle (start on mount, stop on unmount)
 */

import * as LocalRenderer from '@getflywheel/local/renderer';
import { ipcRenderer } from 'electron';
import { TableListRow } from '@getflywheel/local-components';
import { Switch } from '@getflywheel/local-components';
import {
	DEBUG_CONSTANTS,
	DEFAULT_DEBUG_STATE,
	DebugConstantsMap,
	DebugConstantName,
	IPC_CHANNELS,
} from '../../shared/types';

interface DebugSwitchesProps {
	site: { id: string };
}

/**
 * Factory that creates the DebugSwitches component bound to the given React instance.
 *
 * @param React — The React instance from Local's addon context (`context.React`).
 * @returns     — A React functional component ready to be rendered.
 */
export function createDebugSwitches(React: typeof import('react')): React.FC<DebugSwitchesProps> {
	const { useState, useEffect, useCallback } = React;

	const DebugSwitches: React.FC<DebugSwitchesProps> = ({ site }) => {
		const [constants, setConstants] = useState<DebugConstantsMap>(DEFAULT_DEBUG_STATE);
		const [loading, setLoading] = useState(true);
		const [updating, setUpdating] = useState<Record<string, boolean>>({});

		/**
		 * Effect: Initial fetch, watcher setup, and external change subscription.
		 *
		 * On mount:
		 *   1. Fetch current constant values from the main process.
		 *   2. Start the wp-config.php file watcher.
		 *   3. Subscribe to external change events.
		 *
		 * On cleanup (unmount or site change):
		 *   1. Remove the IPC event listener.
		 *   2. Stop the file watcher.
		 */
		useEffect(() => {
			LocalRenderer.ipcAsync(IPC_CHANNELS.GET_DEBUG_CONSTANTS, site.id)
				.then((result: DebugConstantsMap) => setConstants(result))
				.catch(() => setConstants(DEFAULT_DEBUG_STATE))
				.finally(() => setLoading(false));

			LocalRenderer.ipcAsync(IPC_CHANNELS.WATCH_SITE, site.id);

			const handleExternalChange = (_event: any, siteId: string, updated: DebugConstantsMap) => {
				if (siteId === site.id) {
					setConstants(updated);
				}
			};

			ipcRenderer.on(IPC_CHANNELS.DEBUG_CONSTANTS_CHANGED, handleExternalChange);

			return () => {
				ipcRenderer.removeListener(IPC_CHANNELS.DEBUG_CONSTANTS_CHANGED, handleExternalChange);
				LocalRenderer.ipcAsync(IPC_CHANNELS.UNWATCH_SITE, site.id);
			};
		}, [site.id]);

		/**
		 * Handles toggling a debug constant switch.
		 *
		 * Implements an optimistic update pattern:
		 *   1. Immediately update the UI to reflect the new value.
		 *   2. Disable the switch while the write is in flight.
		 *   3. Send the new value to the main process via IPC.
		 *   4. On failure, revert the UI to the previous value.
		 *   5. Re-enable the switch.
		 */
		const handleToggle = useCallback(
			async (name: string, value: boolean) => {
				const previous = constants[name as DebugConstantName];
				setConstants((prev) => ({ ...prev, [name]: value }));
				setUpdating((prev) => ({ ...prev, [name]: true }));

				try {
					await LocalRenderer.ipcAsync(IPC_CHANNELS.SET_DEBUG_CONSTANT, site.id, name, value);
				} catch (e) {
					setConstants((prev) => ({ ...prev, [name]: previous }));
				} finally {
					setUpdating((prev) => ({ ...prev, [name]: false }));
				}
			},
			[site.id, constants],
		);

		if (loading) {
			return null;
		}

		return (
			<>
				{DEBUG_CONSTANTS.map((constant) => (
					<TableListRow key={constant} label={constant} alignMiddle>
						<Switch
							tiny={true}
							flat={true}
							disabled={!!updating[constant]}
							name={constant}
							checked={constants[constant]}
							onChange={handleToggle}
						/>
					</TableListRow>
				))}
			</>
		);
	};

	return DebugSwitches;
}
