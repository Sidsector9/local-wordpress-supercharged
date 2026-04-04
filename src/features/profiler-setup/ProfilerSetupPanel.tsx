/**
 * ProfilerSetupPanel.tsx -- React component for the profiler setup UI.
 *
 * Exports a factory function (`createProfilerSetupPanel`) that accepts a
 * React instance and returns the component. This factory pattern is necessary
 * because Local provides its own React instance via `context.React`.
 *
 * The component renders a TableListRow in the Utilities section with:
 *   - A "Setup Profiler" / "Re-run Setup" button
 *   - A scrollable log panel showing real-time installation progress
 *   - A verification checklist showing the status of each tool
 *   - Error display for failures
 */

import * as LocalRenderer from '@getflywheel/local/renderer';
import { ipcRenderer } from 'electron';
import { TextButton } from '@getflywheel/local-components';
import { IPC_CHANNELS, ProfilerSetupStatus, ToolCheckResult } from '../../shared/types';

interface ProfilerSetupPanelProps {
	site: { id: string };
}

/**
 * Returns the appropriate label for the profiler setup action button
 * based on the current installation and readiness state.
 *
 * @param installing
 * @param allReady
 */
function getButtonLabel( installing: boolean, allReady: boolean | null ): string {
	if ( installing ) {
		return 'Installing...';
	}
	if ( allReady ) {
		return 'Re-run Setup';
	}
	return 'Setup Profiler';
}

/**
 * Factory function that creates the ProfilerSetupPanel component.
 *
 * @param React -- The React instance from Local's addon context.
 * @return     -- The ProfilerSetupPanel functional component.
 */
export function createProfilerSetupPanel(
	React: typeof import( 'react' ),
): React.FC<ProfilerSetupPanelProps> {
	const { useState, useEffect, useCallback, useRef } = React;

	/**
	 * Renders a single tool status line in the verification checklist.
	 * @param root0
	 * @param root0.label
	 * @param root0.result
	 */
	const ToolStatusLine = ( { label, result }: { label: string; result: ToolCheckResult } ) => {
		let icon = '-';
		if ( result.status === 'ready' ) {
			icon = '\u2713';
		} else if ( result.status === 'error' ) {
			icon = '\u2717';
		}

		let color = '#7f8c8d';
		if ( result.status === 'ready' ) {
			color = '#27ae60';
		} else if ( result.status === 'error' ) {
			color = '#e74c3c';
		}
		let detail = 'not installed';
		if ( result.version ) {
			detail = result.version;
		} else if ( result.error ) {
			detail = result.error;
		}

		return (
			<div style={ { color } }>
				<span style={ { marginRight: '6px' } }>{ icon }</span>
				<strong>{ label }</strong>: { detail }
			</div>
		);
	};

	const ProfilerSetupPanel: React.FC<ProfilerSetupPanelProps> = ( { site } ) => {
		const [ status, setStatus ] = useState<ProfilerSetupStatus | null>( null );
		const [ installing, setInstalling ] = useState( false );
		const [ logs, setLogs ] = useState<string[]>( [] );
		const [ error, setError ] = useState( '' );
		const logEndRef = useRef<HTMLDivElement>( null );

		// Auto-scroll log panel to bottom when new logs arrive
		useEffect( () => {
			if ( logEndRef.current ) {
				logEndRef.current.scrollIntoView( { behavior: 'smooth' } );
			}
		}, [ logs ] );

		/**
		 * On mount: fetch current tool status from main process,
		 * subscribe to log and completion push events.
		 * On unmount: unsubscribe from all IPC listeners.
		 */
		useEffect( () => {
			let active = true;

			LocalRenderer.ipcAsync( IPC_CHANNELS.GET_PROFILER_STATUS, site.id )
				.then( ( result: ProfilerSetupStatus ) => {
					if ( active ) {
						setStatus( result );
					}
				} )
				.catch( () => {
					// Status will remain null, showing no indicator
				} );

			const onLog = ( _event: any, siteId: string, message: string ) => {
				if ( active && siteId === site.id ) {
					setLogs( ( prev ) => [ ...prev, message ] );
				}
			};

			const onCompleted = ( _event: any, siteId: string, result: ProfilerSetupStatus ) => {
				if ( active && siteId === site.id ) {
					setStatus( result );
					setInstalling( false );
				}
			};

			ipcRenderer.on( IPC_CHANNELS.PROFILER_SETUP_LOG, onLog );
			ipcRenderer.on( IPC_CHANNELS.PROFILER_SETUP_COMPLETED, onCompleted );

			return () => {
				active = false;
				ipcRenderer.removeListener( IPC_CHANNELS.PROFILER_SETUP_LOG, onLog );
				ipcRenderer.removeListener( IPC_CHANNELS.PROFILER_SETUP_COMPLETED, onCompleted );
			};
		}, [ site.id ] );

		/**
		 * Runs the full profiler setup sequence via IPC.
		 */
		const handleSetup = useCallback( async () => {
			setInstalling( true );
			setLogs( [] );
			setError( '' );

			try {
				const result: ProfilerSetupStatus = await LocalRenderer.ipcAsync(
					IPC_CHANNELS.RUN_PROFILER_SETUP,
					site.id,
				);
				setStatus( result );
			} catch ( e: any ) {
				setError( e.message || 'Setup failed' );
			} finally {
				setInstalling( false );
			}
		}, [ site.id ] );

		const allReady = status &&
			status.xhprof.status === 'ready' &&
			status.k6.status === 'ready' &&
			status.muPlugin.status === 'ready';

		return (
			<div style={ { display: 'flex', flexDirection: 'column', gap: '8px' } }>
				{ /* Action button */ }
				<div>
					<TextButton
						onClick={ handleSetup }
						disabled={ installing }
						style={ { paddingLeft: 0 } }
					>
						{ getButtonLabel( installing, allReady ) }
					</TextButton>
				</div>

				{ /* Log panel */ }
				{ logs.length > 0 && (
					<div style={ {
						maxHeight: '150px',
						overflowY: 'auto',
						backgroundColor: '#1e1e1e',
						color: '#d4d4d4',
						fontFamily: 'monospace',
						fontSize: '12px',
						padding: '8px',
						borderRadius: '4px',
						lineHeight: '1.4',
					} }>
						{ logs.map( ( log, i ) => (
							<div key={ i }>{ log }</div>
						) ) }
						<div ref={ logEndRef } />
					</div>
				) }

				{ /* Verification checklist */ }
				{ status && ! installing && (
					<div style={ { fontSize: '13px', lineHeight: '1.6' } }>
						<ToolStatusLine label="xhprof" result={ status.xhprof } />
						<ToolStatusLine label="k6" result={ status.k6 } />
						<ToolStatusLine label="profiler agent" result={ status.muPlugin } />
					</div>
				) }

				{ /* Error display */ }
				{ error && (
					<div style={ { color: '#e74c3c', fontSize: '13px' } }>
						{ error }
					</div>
				) }
			</div>
		);
	};

	return ProfilerSetupPanel;
}

