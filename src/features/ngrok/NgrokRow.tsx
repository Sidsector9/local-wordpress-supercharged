/**
 * NgrokRow.tsx -- React component for managing ngrok tunnels.
 *
 * Exports a factory function (`createNgrokRow`) that accepts a React
 * instance and returns the component. This factory pattern is necessary because
 * Local provides its own React instance via `context.React`, and we must use
 * that rather than importing React directly (version mismatch risk).
 *
 * The component renders a TableListRow with:
 *   - URL text input for entering the ngrok domain
 *   - Save button to persist the URL to cache
 *   - Clear button to remove the URL mapping
 *   - Start/Stop button that enables wp-config.php constants AND spawns/kills
 *     the ngrok tunnel in one step
 *   - Status indicator (green/gray dot) showing tunnel state via the agent API
 *   - Inline error display for ngrok failures
 *
 * State is loaded from the main process on mount via GET_NGROK and
 * GET_NGROK_PROCESS_STATUS. Push events (NGROK_CHANGED,
 * NGROK_PROCESS_STATUS_CHANGED) keep the UI in sync when changes
 * happen from other sites or from the main process (e.g. site stopped).
 */

import * as LocalRenderer from '@getflywheel/local/renderer';
import { ipcRenderer } from 'electron';
import { TableListRow } from '@getflywheel/local-components';
import { TextButtonExternal } from '@getflywheel/local-components';
import { IPC_CHANNELS } from '../../shared/types';

interface NgrokRowProps {
	site: { id: string };
}

/**
 * Factory function that creates the NgrokRow component.
 *
 * @param React -- The React instance from Local's addon context.
 * @returns     -- The NgrokRow functional component.
 */
export function createNgrokRow(React: typeof import('react')): React.FC<NgrokRowProps> {
	const { useState, useEffect, useCallback } = React;

	const NgrokRow: React.FC<NgrokRowProps> = ({ site }) => {
		const [enabled, setEnabled] = useState(false);
		const [url, setUrl] = useState('');
		const [savedUrl, setSavedUrl] = useState('');
		const [loading, setLoading] = useState(true);
		const [updating, setUpdating] = useState(false);
		const [processStatus, setProcessStatus] = useState<'stopped' | 'running'>('stopped');
		const [error, setError] = useState('');

		/**
		 * On mount: fetch cached state and process status from main process,
		 * subscribe to push events for cross-site updates.
		 * On unmount: unsubscribe from all IPC listeners.
		 */
		useEffect(() => {
			let active = true;

			LocalRenderer.ipcAsync(IPC_CHANNELS.GET_NGROK, site.id)
				.then((result: { enabled: boolean; url: string }) => {
					if (active) {
						setEnabled(!!result.enabled);
						setUrl(result.url || '');
						setSavedUrl(result.url || '');
					}
				})
				.catch(() => {
					if (active) {
						setEnabled(false);
						setUrl('');
						setSavedUrl('');
					}
				})
				.finally(() => {
					if (active) {
						setLoading(false);
					}
				});

			LocalRenderer.ipcAsync(IPC_CHANNELS.GET_NGROK_PROCESS_STATUS, site.id)
				.then((status: string) => {
					if (active) {
						setProcessStatus(status === 'running' ? 'running' : 'stopped');
					}
				})
				.catch(() => {});

			const handleNgrokChanged = (_event: any, siteId: string, newEnabled: boolean) => {
				if (siteId === site.id && active) {
					setEnabled(newEnabled);
				}
			};

			const handleProcessStatusChanged = (_event: any, siteId: string, status: string, errorMsg?: string) => {
				if (siteId === site.id && active) {
					setProcessStatus(status === 'running' ? 'running' : 'stopped');
					setError(errorMsg || '');
				}
			};

			ipcRenderer.on(IPC_CHANNELS.NGROK_CHANGED, handleNgrokChanged);
			ipcRenderer.on(IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, handleProcessStatusChanged);

			return () => {
				active = false;
				ipcRenderer.removeListener(IPC_CHANNELS.NGROK_CHANGED, handleNgrokChanged);
				ipcRenderer.removeListener(IPC_CHANNELS.NGROK_PROCESS_STATUS_CHANGED, handleProcessStatusChanged);
			};
		}, [site.id]);

		/** Updates the URL input value (not yet persisted). */
		const handleUrlChange = useCallback(
			(event: any) => {
				setUrl(event.target.value);
			},
			[],
		);

		/** Persists the URL to cache via APPLY_NGROK. */
		const handleApply = useCallback(
			async () => {
				const trimmed = url.trim();
				if (!trimmed) {
					return;
				}

				setUpdating(true);
				try {
					await LocalRenderer.ipcAsync(IPC_CHANNELS.APPLY_NGROK, site.id, trimmed);
					setSavedUrl(trimmed);
					setUrl(trimmed);
				} catch (e) {
					// keep current input value
				} finally {
					setUpdating(false);
				}
			},
			[site.id, url],
		);

		/** Clears the URL mapping and constants via CLEAR_NGROK. */
		const handleClear = useCallback(
			async () => {
				setUpdating(true);
				try {
					await LocalRenderer.ipcAsync(IPC_CHANNELS.CLEAR_NGROK, site.id);
					setEnabled(false);
					setUrl('');
					setSavedUrl('');
				} catch (e) {
					// keep current state
				} finally {
					setUpdating(false);
				}
			},
			[site.id],
		);

		/**
		 * Starts or stops the ngrok tunnel.
		 *
		 * Start: ENABLE_NGROK(true) -> sets wp-config.php constants,
		 *        then START_NGROK_PROCESS -> spawns the tunnel.
		 * Stop:  STOP_NGROK_PROCESS -> kills the tunnel,
		 *        then ENABLE_NGROK(false) -> removes wp-config.php constants.
		 */
		const handleStartStop = useCallback(
			async () => {
				if (!savedUrl.trim()) {
					return;
				}

				setUpdating(true);
				setError('');
				try {
					if (enabled) {
						await LocalRenderer.ipcAsync(IPC_CHANNELS.STOP_NGROK_PROCESS, site.id);
						await LocalRenderer.ipcAsync(IPC_CHANNELS.ENABLE_NGROK, site.id, false, savedUrl.trim());
						setEnabled(false);
					} else {
						await LocalRenderer.ipcAsync(IPC_CHANNELS.ENABLE_NGROK, site.id, true, savedUrl.trim());
						setEnabled(true);
						await LocalRenderer.ipcAsync(IPC_CHANNELS.START_NGROK_PROCESS, site.id);
					}
				} catch (e: any) {
					setError(e?.message || 'Failed to toggle ngrok');
				} finally {
					setUpdating(false);
				}
			},
			[site.id, enabled, savedUrl],
		);

		if (loading) {
			return null;
		}

		const urlDirty = url.trim() !== savedUrl;
		const isRunning = processStatus === 'running';

		return (
			<TableListRow label="ngrok" alignMiddle>
				<div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
					<input
						type="text"
						placeholder="Enter the ngrok URL"
						value={url}
						onChange={handleUrlChange}
						readOnly={enabled}
						disabled={updating}
						style={{
							flexGrow: 1,
							minWidth: '220px',
							background: 'transparent',
							border: 'none',
							borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
							color: 'inherit',
							fontSize: 'inherit',
							fontFamily: 'inherit',
							padding: '4px 0',
							outline: 'none',
							opacity: enabled ? 0.6 : 1,
						}}
					/>
					<TextButtonExternal
						onClick={handleApply}
						disabled={updating || enabled || !url.trim() || !urlDirty}
					>
						Save
					</TextButtonExternal>
					<TextButtonExternal
						onClick={handleClear}
						disabled={updating || (!url && !savedUrl)}
					>
						Clear
					</TextButtonExternal>
					<TextButtonExternal
						onClick={handleStartStop}
						disabled={updating || !savedUrl.trim()}
					>
						{enabled ? 'Stop' : 'Start'}
					</TextButtonExternal>
					{savedUrl && (
						<span style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: '4px',
							fontSize: '12px',
							opacity: 0.8,
							whiteSpace: 'nowrap',
						}}>
							<span style={{
								width: '8px',
								height: '8px',
								borderRadius: '50%',
								backgroundColor: isRunning ? '#51bb7b' : '#9b9b9b',
							}} />
							{isRunning ? 'Tunnel active' : 'Tunnel inactive'}
						</span>
					)}
				</div>
				{error && (
					<div style={{ color: '#e74c3c', fontSize: '12px', marginTop: '6px' }}>
						{error}
					</div>
				)}
			</TableListRow>
		);
	};

	return NgrokRow;
}
