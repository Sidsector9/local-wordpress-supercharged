/**
 * ConflictTestPanel.tsx -- React component for conflict testing.
 *
 * Displays a list of all plugins with toggle switches to
 * enable/disable them via filter hooks (no database changes).
 */

import * as LocalRenderer from '@getflywheel/local/renderer';
import { TextButton } from '@getflywheel/local-components';
import { IPC_CHANNELS, PluginInfo, ConflictOverrides, PluginDependencyMap } from '../../shared/types';

interface ConflictTestPanelProps {
	site: { id: string };
}

export function createConflictTestPanel(
	React: typeof import('react'),
): React.FC<ConflictTestPanelProps> {
	const { useState, useEffect, useCallback } = React;

	const ConflictTestPanel: React.FC<ConflictTestPanelProps> = ({ site }) => {
		const [plugins, setPlugins] = useState<PluginInfo[]>([]);
		const [deps, setDeps] = useState<PluginDependencyMap>({});
		const [overrides, setOverrides] = useState<ConflictOverrides>({ overrides: {} });
		const [loading, setLoading] = useState(true);
		const [error, setError] = useState('');
		const [updating, setUpdating] = useState<Record<string, boolean>>({});

		const fetchData = useCallback(async () => {
			setLoading(true);
			setError('');
			try {
				const [pluginData, overrideConfig]: [
					{ plugins: PluginInfo[]; dependencies: PluginDependencyMap },
					ConflictOverrides,
				] = await Promise.all([
					LocalRenderer.ipcAsync(IPC_CHANNELS.GET_PLUGIN_LIST, site.id),
					LocalRenderer.ipcAsync(IPC_CHANNELS.GET_CONFLICT_OVERRIDES, site.id),
				]);
				setPlugins(pluginData.plugins);
				setDeps(pluginData.dependencies);
				setOverrides(overrideConfig);
			} catch (e: any) {
				setError(e.message || 'Failed to load plugins');
			} finally {
				setLoading(false);
			}
		}, [site.id]);

		useEffect(() => { fetchData(); }, [fetchData]);

		const getEffectiveState = useCallback((plugin: PluginInfo): boolean => {
			if (plugin.file in overrides.overrides) {
				return overrides.overrides[plugin.file];
			}
			return plugin.status === 'active';
		}, [overrides]);

		const hasOverride = useCallback((plugin: PluginInfo): boolean => {
			return plugin.file in overrides.overrides;
		}, [overrides]);

		const handleToggle = useCallback(async (plugin: PluginInfo) => {
			const newState = !getEffectiveState(plugin);
			setUpdating((prev) => ({ ...prev, [plugin.file]: true }));
			try {
				const result: ConflictOverrides = await LocalRenderer.ipcAsync(
					IPC_CHANNELS.SET_CONFLICT_OVERRIDE,
					site.id,
					plugin.file,
					newState,
					plugin.status,
				);
				setOverrides(result);
			} catch {
				// ignore
			} finally {
				setUpdating((prev) => ({ ...prev, [plugin.file]: false }));
			}
		}, [site.id, getEffectiveState]);

		const handleReset = useCallback(async () => {
			try {
				const result: ConflictOverrides = await LocalRenderer.ipcAsync(
					IPC_CHANNELS.CLEAR_CONFLICT_OVERRIDES,
					site.id,
				);
				setOverrides(result);
			} catch {
				// ignore
			}
		}, [site.id]);

		if (loading) {
			return <div style={{ fontSize: '13px', color: '#999' }}>Loading plugins...</div>;
		}

		if (plugins.length === 0) {
			return (
				<div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
					<span style={{ fontSize: '13px', color: '#999' }}>
						{error || 'No plugins found. Make sure the site is running.'}
					</span>
					<TextButton onClick={fetchData} style={{ paddingLeft: 0 }}>Retry</TextButton>
				</div>
			);
		}

		const hasAnyOverrides = Object.keys(overrides.overrides).length > 0;

		return (
			<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '50px' }}>
					<span style={{ fontSize: '13px', color: '#999' }}>
						Toggle plugins on/off without modifying the database. Changes take effect on next page load.
					</span>
					{hasAnyOverrides && (
						<TextButton onClick={handleReset} style={{ paddingLeft: 0 }}>
							Reset All
						</TextButton>
					)}
				</div>

				<div style={{
					maxHeight: '400px',
					overflowY: 'auto',
					border: '1px solid #333',
					borderRadius: '4px',
				}}>
					<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
						<thead>
							<tr style={{ borderBottom: '1px solid #333', position: 'sticky', top: 0, background: '#1e1e1e' }}>
								<th style={{ padding: '8px 12px', textAlign: 'left', width: '30px' }}>DB</th>
								<th style={{ padding: '8px 12px', textAlign: 'left' }}>Plugins</th>
								<th style={{ padding: '8px 12px', textAlign: 'left', width: '80px' }}>Version</th>
								<th style={{ padding: '8px 12px', textAlign: 'center', width: '70px' }}>Active</th>
							</tr>
						</thead>
						<tbody>
							{plugins.map((plugin) => {
								const effective = getEffectiveState(plugin);
								const isOverridden = hasOverride(plugin);
								const isUpdating = updating[plugin.file] || false;
								const dbActive = plugin.status === 'active';

								return (
									<tr
										key={plugin.file}
										style={{
											borderBottom: '1px solid #2a2a2a',
											opacity: isUpdating ? 0.5 : 1,
											backgroundColor: isOverridden ? 'rgba(255, 165, 0, 0.05)' : 'transparent',
										}}
									>
										<td style={{ padding: '6px 12px' }}>
											<span style={{
												display: 'inline-block',
												width: '8px',
												height: '8px',
												borderRadius: '50%',
												backgroundColor: dbActive ? '#27ae60' : '#7f8c8d',
											}} />
										</td>
										<td style={{ padding: '6px 12px' }}>
											{plugin.name}
											{isOverridden && (
												<span style={{ marginLeft: '8px', fontSize: '11px', color: '#f39c12' }}>
													(overridden)
												</span>
											)}
											{deps[plugin.file] && (
												<span style={{ marginLeft: '8px', fontSize: '11px', color: '#7f8c8d' }}>
													requires: {deps[plugin.file]}
												</span>
											)}
										</td>
										<td style={{ padding: '6px 12px', color: '#999' }}>{plugin.version}</td>
										<td style={{ padding: '6px 12px', textAlign: 'center' }}>
											<input
												type="checkbox"
												checked={effective}
												disabled={isUpdating}
												onChange={() => handleToggle(plugin)}
												style={{ cursor: isUpdating ? 'wait' : 'pointer' }}
											/>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>

				<div style={{ fontSize: '12px', color: '#777', lineHeight: '1.6' }}>
					<strong>DB</strong> = the plugin's real status in the database (green = active, gray = inactive).
					This does not change when you toggle.<br />
					<strong>Active</strong> = whether the plugin will actually load on the next page request.
					Uncheck to deactivate a plugin for testing without modifying the database.
				</div>
			</div>
		);
	};

	return ConflictTestPanel;
}
