/**
 * DebugSwitches.tsx -- React component and hook registration for toggling
 * WordPress debug constants (WP_DEBUG, WP_DEBUG_LOG, WP_DEBUG_DISPLAY, SCRIPT_DEBUG).
 *
 * Handles optimistic UI updates with rollback, and real-time sync when
 * wp-config.php is modified externally via file watcher events.
 */

import * as LocalRenderer from '@getflywheel/local/renderer';
import { ipcRenderer } from 'electron';
import { TableListRow, Switch } from '@getflywheel/local-components';
import {
	DEBUG_CONSTANTS,
	DEFAULT_DEBUG_STATE,
	DebugConstantsMap,
	DebugConstantName,
	IPC_CHANNELS,
} from '../../shared/types';

let React: typeof import( 'react' );

interface DebugSwitchesProps {
	site: { id: string };
}

export function registerDebugConstantsHooks(
	_React: typeof import( 'react' ),
	hooks: typeof LocalRenderer.HooksRenderer,
): void {
	React = _React;

	hooks.addContent( 'SiteInfoOverview_TableList', ( site ) => (
		<DebugSwitches key="wordpress-supercharged-debug" site={ site } />
	) );
}

function DebugSwitches( { site }: DebugSwitchesProps ) {
	const { useState, useEffect, useCallback } = React;

	const [ constants, setConstants ] = useState<DebugConstantsMap>( DEFAULT_DEBUG_STATE );
	const [ loading, setLoading ] = useState( true );
	const [ updating, setUpdating ] = useState<Record<string, boolean>>( {} );

	useEffect( () => {
		LocalRenderer.ipcAsync( IPC_CHANNELS.GET_DEBUG_CONSTANTS, site.id )
			.then( ( result: DebugConstantsMap ) => setConstants( result ) )
			.catch( () => setConstants( DEFAULT_DEBUG_STATE ) )
			.finally( () => setLoading( false ) );

		LocalRenderer.ipcAsync( IPC_CHANNELS.WATCH_SITE, site.id );

		const handleExternalChange = ( _event: any, siteId: string, updated: DebugConstantsMap ) => {
			if ( siteId === site.id ) {
				setConstants( updated );
			}
		};

		ipcRenderer.on( IPC_CHANNELS.DEBUG_CONSTANTS_CHANGED, handleExternalChange );

		return () => {
			ipcRenderer.removeListener( IPC_CHANNELS.DEBUG_CONSTANTS_CHANGED, handleExternalChange );
			LocalRenderer.ipcAsync( IPC_CHANNELS.UNWATCH_SITE, site.id );
		};
	}, [ site.id ] );

	const handleToggle = useCallback(
		async ( name: string, value: boolean ) => {
			const previous = constants[ name as DebugConstantName ];
			setConstants( ( prev ) => ( { ...prev, [ name ]: value } ) );
			setUpdating( ( prev ) => ( { ...prev, [ name ]: true } ) );

			try {
				const result = await LocalRenderer.ipcAsync( IPC_CHANNELS.SET_DEBUG_CONSTANT, site.id, name, value );
				if ( result?.constants ) {
					setConstants( result.constants );
				}
			} catch ( e ) {
				setConstants( ( prev ) => ( { ...prev, [ name ]: previous } ) );
			} finally {
				setUpdating( ( prev ) => ( { ...prev, [ name ]: false } ) );
			}
		},
		[ site.id, constants ],
	);

	if ( loading ) {
		return null;
	}

	return (
		<>
			{ DEBUG_CONSTANTS.map( ( constant ) => (
				<TableListRow key={ constant } label={ constant } alignMiddle>
					<Switch
						tiny={ true }
						flat={ true }
						disabled={ !! updating[ constant ] }
						name={ constant }
						checked={ constants[ constant ] }
						onChange={ handleToggle }
					/>
				</TableListRow>
			) ) }
		</>
	);
}
