/**
 * VulnScanPanel.tsx -- React component and hook registration for vulnerability scanning.
 *
 * Displays a textarea for package@version input, scope checkboxes,
 * progress log, and results table in the Tools tab.
 */

import * as LocalRenderer from '@getflywheel/local/renderer';
import { TableListRow, TextButton } from '@getflywheel/local-components';
import { IPC_CHANNELS, VulnPackageQuery, VulnScanMatch, VulnScanOptions, VulnScanResult } from '../../shared/types';

let React: typeof import( 'react' );
let ipcRenderer: any;
let clipboard: any;

try {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const electron = require( 'electron' );
	ipcRenderer = electron.ipcRenderer;
	clipboard = electron.clipboard;
} catch {
	// Not in Electron environment (e.g. tests)
}

interface VulnScanPanelProps {
	site: { id: string };
}

/**
 * Registers the Vulnerability Scan panel into the Tools tab via the
 * siteInfoUtilities content hook.
 *
 * @param _React - React instance from the addon context.
 * @param hooks  - HooksRenderer instance for registering content hooks.
 */
export function registerVulnScanHooks(
	_React: typeof import( 'react' ),
	hooks: typeof LocalRenderer.HooksRenderer,
): void {
	React = _React;

	hooks.addContent( 'siteInfoUtilities', ( site ) => (
		<TableListRow key="wordpress-supercharged-vuln-scan" label="Vulnerability Scan">
			<VulnScanPanel site={ site } />
		</TableListRow>
	) );
}

/**
 * Parses and validates the textarea input into structured package queries.
 *
 * @param raw - Newline-separated "name@version" entries.
 * @return Parsed packages and an error string (empty if valid).
 */
function parseAndValidateInput( raw: string ): { packages: VulnPackageQuery[]; error: string } {
	const entries = raw.split( /\r?\n/ ).map( ( s ) => s.trim() ).filter( Boolean );
	if ( entries.length === 0 ) {
		return { packages: [], error: 'Enter at least one package (e.g. axios@1.14.1)' };
	}

	const packages: VulnPackageQuery[] = [];
	for ( const entry of entries ) {
		let atIdx: number;
		if ( entry.startsWith( '@' ) ) {
			atIdx = entry.indexOf( '@', 1 );
		} else {
			atIdx = entry.indexOf( '@' );
		}

		if ( atIdx <= 0 || atIdx === entry.length - 1 ) {
			return { packages: [], error: `Invalid format: "${ entry }". Expected name@version` };
		}

		const name = entry.slice( 0, atIdx ).toLowerCase();
		const version = entry.slice( atIdx + 1 );

		if ( ! name || ! version ) {
			return { packages: [], error: `Invalid format: "${ entry }". Expected name@version` };
		}

		packages.push( { name, version } );
	}

	return { packages, error: '' };
}

/**
 * Inline button that copies the given text to the clipboard.
 *
 * @param root0      - Props object.
 * @param root0.text - The text to copy on click.
 */
function CopyButton( { text }: { text: string } ) {
	const { useState, useCallback } = React;
	const [ copied, setCopied ] = useState( false );

	const handleCopy = useCallback( () => {
		if ( clipboard ) {
			clipboard.writeText( text );
		}
		setCopied( true );
		setTimeout( () => setCopied( false ), 1500 );
	}, [ text ] );

	return (
		<button
			type="button"
			onClick={ handleCopy }
			title={ text }
			style={ {
				background: 'none',
				border: '1px solid #555',
				borderRadius: '3px',
				color: copied ? '#27ae60' : '#999',
				fontSize: '11px',
				padding: '2px 6px',
				cursor: 'pointer',
				marginLeft: '6px',
				whiteSpace: 'nowrap',
			} }
		>
			{ copied ? 'Copied' : 'Copy path' }
		</button>
	);
}

/**
 * Vulnerability scan panel. Accepts package@version input, runs scans
 * across selected scopes, and displays results in a table.
 *
 * @param root0      - Props object.
 * @param root0.site - The current Local site object.
 */
function VulnScanPanel( { site }: VulnScanPanelProps ) {
	const { useState, useEffect, useCallback, useRef } = React;

	const [ input, setInput ] = useState( '' );
	const [ scanAllSites, setScanAllSites ] = useState( false );
	const [ includeGlobal, setIncludeGlobal ] = useState( false );
	const [ includeCaches, setIncludeCaches ] = useState( false );
	const [ scanning, setScanning ] = useState( false );
	const [ progress, setProgress ] = useState<string[]>( [] );
	const [ result, setResult ] = useState<VulnScanResult | null>( null );
	const [ inputError, setInputError ] = useState( '' );
	const progressRef = useRef<HTMLDivElement | null>( null );

	// Listen for progress events from main process
	useEffect( () => {
		if ( ! ipcRenderer ) {
			return undefined;
		}

		const handleProgress = ( _event: any, siteId: string, msg: string ) => {
			if ( siteId === site.id ) {
				setProgress( ( prev ) => [ ...prev, msg ] );
			}
		};

		ipcRenderer.on( IPC_CHANNELS.VULN_SCAN_PROGRESS, handleProgress );
		return () => {
			ipcRenderer.removeListener( IPC_CHANNELS.VULN_SCAN_PROGRESS, handleProgress );
		};
	}, [ site.id ] );

	// Auto-scroll progress log
	useEffect( () => {
		if ( progressRef.current ) {
			progressRef.current.scrollTop = progressRef.current.scrollHeight;
		}
	}, [ progress ] );

	const handleScan = useCallback( async () => {
		const { packages, error } = parseAndValidateInput( input );
		if ( error ) {
			setInputError( error );
			return;
		}

		setInputError( '' );
		setScanning( true );
		setProgress( [] );
		setResult( null );

		try {
			const options: VulnScanOptions = {
				packages,
				scanAllSites,
				includeGlobal,
				includeCaches,
			};

			const scanResult: VulnScanResult = await LocalRenderer.ipcAsync(
				IPC_CHANNELS.START_VULN_SCAN,
				site.id,
				options,
			);
			setProgress( [] );
			setResult( scanResult );
		} catch ( e: any ) {
			setProgress( [] );
			setResult( {
				matches: [],
				toolsDetected: [],
				errors: [ e.message || 'Scan failed' ],
				scannedLocations: 0,
				globalRootsScanned: [],
				cacheRootsScanned: [],
			} );
		} finally {
			setScanning( false );
		}
	}, [ input, scanAllSites, includeGlobal, includeCaches, site.id ] );

	return (
		<div style={ { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px' } }>
			{ /* Input */ }
			<div>
				<textarea
					value={ input }
					onChange={ ( e: any ) => {
						setInput( e.target.value );
						setInputError( '' );
					} }
					placeholder={ 'Enter vulnerable packages (one per line, e.g.)\naxios@1.14.1\nlodash@4.17.20' }
					disabled={ scanning }
					rows={ 5 }
					style={ {
						width: '100%',
						minHeight: '60px',
						padding: '8px',
						fontSize: '13px',
						fontFamily: 'monospace',
						background: '#2a2a2a',
						color: '#e0e0e0',
						border: inputError ? '1px solid #e74c3c' : '1px solid #444',
						borderRadius: '4px',
						resize: 'vertical',
					} }
				/>
				{ inputError && (
					<div style={ { color: '#e74c3c', fontSize: '12px', marginTop: '4px' } }>
						{ inputError }
					</div>
				) }
			</div>

			{ /* Checkboxes */ }
			<div style={ { display: 'flex', gap: '20px', flexWrap: 'wrap' } }>
				<label htmlFor="vuln-scan-all-sites" style={ { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' } }>
					<input
						id="vuln-scan-all-sites"
						type="checkbox"
						checked={ scanAllSites }
						disabled={ scanning }
						onChange={ ( e: any ) => setScanAllSites( e.target.checked ) }
					/>
					Scan all Local sites
				</label>
				<label htmlFor="vuln-scan-global" style={ { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' } }>
					<input
						id="vuln-scan-global"
						type="checkbox"
						checked={ includeGlobal }
						disabled={ scanning }
						onChange={ ( e: any ) => setIncludeGlobal( e.target.checked ) }
					/>
					Scan global installations
				</label>
				<label htmlFor="vuln-scan-caches" style={ { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' } }>
					<input
						id="vuln-scan-caches"
						type="checkbox"
						checked={ includeCaches }
						disabled={ scanning }
						onChange={ ( e: any ) => setIncludeCaches( e.target.checked ) }
					/>
					Scan package caches
				</label>
			</div>

			{ /* Scan button */ }
			<div>
				<TextButton
					onClick={ handleScan }
					disabled={ scanning || ! input.trim() }
					style={ { paddingLeft: 0 } }
				>
					{ scanning ? 'Scanning...' : 'Scan' }
				</TextButton>
			</div>

			{ /* Progress log */ }
			{ progress.length > 0 && (
				<div
					ref={ progressRef }
					style={ {
						maxHeight: '150px',
						overflowY: 'auto',
						background: '#1a1a1a',
						border: '1px solid #333',
						borderRadius: '4px',
						padding: '8px',
						fontFamily: 'monospace',
						fontSize: '12px',
						color: '#999',
						lineHeight: '1.6',
					} }
				>
					{ progress.map( ( msg, i ) => (
						<div key={ i }>{ msg }</div>
					) ) }
				</div>
			) }

			{ /* Scan summary */ }
			{ result && ( result.globalRootsScanned.length > 0 || result.cacheRootsScanned.length > 0 ) && (
				<div style={ { fontSize: '13px', color: '#27ae60', lineHeight: '1.8' } }>
					{ result.globalRootsScanned.length > 0 && (
						<div>Scanned global: { result.globalRootsScanned.join( ', ' ) }</div>
					) }
					{ result.cacheRootsScanned.length > 0 && (
						<div>Scanned caches: { result.cacheRootsScanned.join( ', ' ) }</div>
					) }
				</div>
			) }

			{ /* Results */ }
			{ result && result.matches.length > 0 && (
				<div>
					<div style={ { fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' } }>
						Found { result.matches.length } match(es) across { result.scannedLocations } location(s)
					</div>
					<div style={ {
						maxHeight: '400px',
						overflowY: 'auto',
						border: '1px solid #333',
						borderRadius: '4px',
					} }>
						<table style={ { width: '100%', borderCollapse: 'collapse', fontSize: '13px' } }>
							<thead>
								<tr style={ {
									borderBottom: '1px solid #333',
									position: 'sticky',
									top: 0,
									background: '#1e1e1e',
								} }>
									<th style={ { padding: '8px 12px', textAlign: 'left' } }>Package</th>
									<th style={ { padding: '8px 12px', textAlign: 'left', width: '100px' } }>Version</th>
									<th style={ { padding: '8px 12px', textAlign: 'left' } }>Location</th>
									<th style={ { padding: '8px 12px', textAlign: 'left', width: '80px' } }>Type</th>
									<th style={ { padding: '8px 12px', textAlign: 'left', width: '90px' } }>Source</th>
								</tr>
							</thead>
							<tbody>
								{ result.matches.map( ( match: VulnScanMatch, idx: number ) => (
									<tr key={ idx } style={ { borderBottom: '1px solid #2a2a2a' } }>
										<td style={ { padding: '6px 12px', fontFamily: 'monospace' } }>
											{ match.packageName }
										</td>
										<td style={ { padding: '6px 12px', fontFamily: 'monospace', color: '#e74c3c' } }>
											{ match.version }
										</td>
										<td style={ { padding: '6px 12px' } }>
											{ match.location }
											<CopyButton text={ match.locationPath } />
										</td>
										<td style={ { padding: '6px 12px', color: '#999' } }>
											{ match.depType === 'direct' ? 'Direct' : 'Transitive' }
										</td>
										<td style={ { padding: '6px 12px', color: '#999' } }>
											{ match.source === 'lock-file' ? 'Lock file' : 'node_modules' }
										</td>
									</tr>
								) ) }
							</tbody>
						</table>
					</div>
				</div>
			) }

			{ /* No results */ }
			{ result && result.matches.length === 0 && result.errors.length === 0 && (
				<div style={ { fontSize: '13px', color: '#27ae60' } }>
					No vulnerable packages found.
				</div>
			) }

			{ /* Errors */ }
			{ result && result.errors.length > 0 && (
				<div style={ { fontSize: '12px', color: '#f39c12', lineHeight: '1.6' } }>
					{ result.errors.map( ( err, i ) => (
						<div key={ i }>Warning: { err }</div>
					) ) }
				</div>
			) }

			{ /* Tools detected */ }
			{ result && result.toolsDetected.length > 0 && (
				<div style={ { fontSize: '12px', color: '#777' } }>
					Detected tools: { result.toolsDetected.join( ', ' ) }
				</div>
			) }
		</div>
	);
}
