/**
 * SnapshotsPanel.tsx -- React component and hook registration for database snapshots.
 *
 * Displays a table of .sql snapshots in app/sql/, allows creating new
 * snapshots and restoring existing ones via WP-CLI.
 */

import * as LocalRenderer from '@getflywheel/local/renderer';
import { TableListRow, TextButton, TextButtonExternal } from '@getflywheel/local-components';
import { IPC_CHANNELS, SnapshotInfo, slugify } from '../../shared/types';

const dateformat = require( 'dateformat' );

let React: typeof import( 'react' );

interface SnapshotsPanelProps {
	site: { id: string; status: string };
}

export function registerSnapshotsHooks(
	_React: typeof import( 'react' ),
	hooks: typeof LocalRenderer.HooksRenderer,
): void {
	React = _React;

	hooks.addContent( 'SiteInfoDatabase_TableList', ( site ) => (
		<TableListRow key="wordpress-supercharged-snapshots" label="Snapshots">
			<SnapshotsPanel site={ site } />
		</TableListRow>
	) );
}

function SnapshotsPanel( { site }: SnapshotsPanelProps ) {
	const { useState, useEffect, useCallback, useMemo } = React;

	const [ snapshots, setSnapshots ] = useState<SnapshotInfo[]>( [] );
	const [ loading, setLoading ] = useState( true );
	const [ snapshotName, setSnapshotName ] = useState( '' );
	const [ taking, setTaking ] = useState( false );
	const [ restoring, setRestoring ] = useState<string | null>( null );
	const [ deleting, setDeleting ] = useState<string | null>( null );
	const [ error, setError ] = useState<string | null>( null );
	const [ success, setSuccess ] = useState<string | null>( null );
	const [ siteStatus, setSiteStatus ] = useState<string>( 'halted' );

	useEffect( () => {
		let active = true;
		const checkStatus = () => {
			LocalRenderer.ipcAsync( IPC_CHANNELS.GET_SITE_STATUS, site.id )
				.then( ( status: string ) => {
					if ( active ) {
						setSiteStatus( status );
					}
				} )
				.catch( () => {} );
		};
		checkStatus();
		const interval = setInterval( checkStatus, 3000 );
		return () => {
			active = false; clearInterval( interval );
		};
	}, [ site.id ] );

	const siteRunning = siteStatus === 'running';

	const scan = useCallback( async () => {
		setLoading( true );
		setError( null );
		setSuccess( null );
		try {
			const result: SnapshotInfo[] = await LocalRenderer.ipcAsync(
				IPC_CHANNELS.SCAN_SNAPSHOTS,
				site.id,
			);
			setSnapshots( result );
		} catch ( e: any ) {
			setError( e.message || 'Failed to scan snapshots' );
		} finally {
			setLoading( false );
		}
	}, [ site.id ] );

	useEffect( () => {
		scan();
	}, [ scan ] );

	const handleTakeSnapshot = useCallback( async () => {
		if ( ! snapshotName.trim() ) {
			return;
		}
		setTaking( true );
		setError( null );
		setSuccess( null );
		try {
			await LocalRenderer.ipcAsync( IPC_CHANNELS.TAKE_SNAPSHOT, site.id, snapshotName );
			setSnapshotName( '' );
			await scan();
		} catch ( e: any ) {
			setError( e.message || 'Failed to create snapshot' );
		} finally {
			setTaking( false );
		}
	}, [ site.id, snapshotName, scan ] );

	const handleRestore = useCallback( async ( filename: string ) => {
		setRestoring( filename );
		setError( null );
		setSuccess( null );
		try {
			await LocalRenderer.ipcAsync( IPC_CHANNELS.RESTORE_SNAPSHOT, site.id, filename );
			const name = filename.replace( /\.zip$/, '' );
			setSuccess( `Snapshot "${ name }" restored successfully.` );
		} catch ( e: any ) {
			setError( e.message || 'Failed to restore snapshot' );
		} finally {
			setRestoring( null );
		}
	}, [ site.id ] );

	const handleDelete = useCallback( async ( filename: string ) => {
		setDeleting( filename );
		setError( null );
		setSuccess( null );
		try {
			await LocalRenderer.ipcAsync( IPC_CHANNELS.DELETE_SNAPSHOT, site.id, filename );
			await scan();
		} catch ( e: any ) {
			setError( e.message || 'Failed to delete snapshot' );
		} finally {
			setDeleting( null );
		}
	}, [ site.id, scan ] );

	const nameSlug = useMemo( () => slugify( snapshotName ), [ snapshotName ] );
	const isDuplicate = useMemo(
		() => nameSlug !== '' && snapshots.some( ( s ) => s.name === nameSlug ),
		[ nameSlug, snapshots ],
	);

	if ( loading && snapshots.length === 0 ) {
		return <div style={ { fontSize: '13px', color: '#999' } }>Loading snapshots...</div>;
	}

	return (
		<div style={ { display: 'flex', flexDirection: 'column', gap: '10px' } }>
			{ /* Header */ }
			<div style={ { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }>
				<span style={ { fontSize: '13px', color: '#999' } }>
					Create and restore database snapshots stored in app/sql/.
				</span>
				<TextButton onClick={ scan } disabled={ loading } style={ { paddingLeft: 0 } }>
					Scan
				</TextButton>
			</div>

			{ ! siteRunning && (
				<div style={ { fontSize: '12px', color: '#f39c12' } }>
					Site must be running to create or restore snapshots.
				</div>
			) }

			{ /* Snapshots table */ }
			<div style={ {
				maxHeight: '320px',
				overflowY: 'auto',
				border: '1px solid #333',
				borderRadius: '4px',
			} }>
				<table style={ { width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed' } }>
					<colgroup>
						<col style={ { width: '50px' } } />
						<col />
						<col style={ { width: '180px' } } />
						<col style={ { width: '100px' } } />
						<col style={ { width: '80px' } } />
					</colgroup>
					<thead>
						<tr style={ { borderBottom: '1px solid #333', position: 'sticky', top: 0, background: '#1e1e1e', zIndex: 1 } }>
							<th style={ { padding: '8px 12px', textAlign: 'left' } }>Sr. No.</th>
							<th style={ { padding: '8px 12px', textAlign: 'left' } }>Snapshot Name</th>
							<th style={ { padding: '8px 12px', textAlign: 'left' } }>Date</th>
							<th style={ { padding: '8px 12px', textAlign: 'center' } }>Restore</th>
							<th style={ { padding: '8px 12px', textAlign: 'center' } }>Delete</th>
						</tr>
					</thead>
					<tbody>
						{ snapshots.length === 0 ? (
							<tr>
								<td colSpan={ 5 } style={ { padding: '16px 12px', textAlign: 'center', color: '#999' } }>
									No snapshots found.
								</td>
							</tr>
						) : (
							snapshots.map( ( snap, index ) => (
								<tr key={ snap.filename } style={ { borderBottom: '1px solid #2a2a2a' } }>
									<td style={ { padding: '6px 12px', color: '#999' } }>{ index + 1 }</td>
									<td style={ { padding: '6px 12px' } }>{ snap.name }</td>
									<td style={ { padding: '6px 12px', color: '#999' } }>
										{ dateformat( new Date( snap.date ), 'mmm d, yyyy h:MM TT' ) }
									</td>
									<td style={ { padding: '6px 12px', textAlign: 'center' } }>
										<TextButton
											onClick={ () => handleRestore( snap.filename ) }
											disabled={ restoring !== null || deleting !== null || ! siteRunning }
											style={ { paddingLeft: 0 } }
										>
											{ restoring === snap.filename ? 'Restoring...' : 'Restore' }
										</TextButton>
									</td>
									<td style={ { padding: '6px 12px', textAlign: 'center' } }>
										<TextButton
											onClick={ () => handleDelete( snap.filename ) }
											disabled={ restoring !== null || deleting !== null }
											style={ { paddingLeft: 0, color: '#e74c3c' } }
										>
											{ deleting === snap.filename ? 'Deleting...' : 'Delete' }
										</TextButton>
									</td>
								</tr>
							) )
						) }
					</tbody>
				</table>
			</div>

			{ /* Success/Error display */ }
			{ success && (
				<div style={ { fontSize: '12px', color: '#27ae60' } }>
					{ success }
				</div>
			) }
			{ error && (
				<div style={ { fontSize: '12px', color: '#e74c3c' } }>
					{ error }
				</div>
			) }

			{ /* Take snapshot section */ }
			<div style={ { display: 'flex', alignItems: 'center', gap: '10px' } }>
				<input
					type="text"
					placeholder="Enter snapshot name"
					value={ snapshotName }
					onChange={ ( e: any ) => setSnapshotName( e.target.value ) }
					onKeyDown={ ( e: any ) => {
						if ( e.key === 'Enter' && snapshotName.trim() && ! taking && ! isDuplicate ) {
							handleTakeSnapshot();
						}
					} }
					disabled={ taking || ! siteRunning }
					style={ {
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
					} }
				/>
				<TextButtonExternal
					onClick={ handleTakeSnapshot }
					disabled={ ! snapshotName.trim() || taking || isDuplicate || ! siteRunning }
				>
					{ taking ? 'Creating...' : 'Take a snapshot' }
				</TextButtonExternal>
			</div>
			{ isDuplicate && (
				<div style={ { fontSize: '12px', color: '#e74c3c', marginTop: '-6px' } }>
					A snapshot named &quot;{ snapshotName.trim() }&quot; already exists.
				</div>
			) }
		</div>
	);
}
