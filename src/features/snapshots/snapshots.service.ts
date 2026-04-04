/**
 * snapshots.service.ts -- Pure functions for scanning, creating, and restoring
 * database snapshots stored as .zip files in app/sql/.
 */

import * as path from 'path';
import * as fs from 'fs-extra';
const AdmZip = require( 'adm-zip' );
import * as Local from '@getflywheel/local';
import * as LocalMain from '@getflywheel/local/main';
import { SnapshotInfo, slugify } from '../../shared/types';

export { slugify };

export function resolveSitePath( site: Local.Site ): string {
	return LocalMain.formatHomePath( site.path );
}

export function getSqlDir( site: Local.Site ): string {
	return path.join( resolveSitePath( site ), 'app', 'sql' );
}

export async function scanSnapshots( site: Local.Site ): Promise<SnapshotInfo[]> {
	const sqlDir = getSqlDir( site );
	await fs.ensureDir( sqlDir );

	const files = await fs.readdir( sqlDir );
	const zipFiles = files.filter( ( f ) => f.endsWith( '.zip' ) );

	const snapshots: SnapshotInfo[] = [];
	for ( const filename of zipFiles ) {
		const stat = await fs.stat( path.join( sqlDir, filename ) );
		snapshots.push( {
			filename,
			name: filename.replace( /\.zip$/, '' ),
			date: stat.mtimeMs,
			size: stat.size,
		} );
	}

	snapshots.sort( ( a, b ) => b.date - a.date );
	return snapshots;
}

export async function takeSnapshot(
	siteDatabase: LocalMain.Services.SiteDatabase,
	wpCli: LocalMain.Services.WpCli,
	site: Local.Site,
	name: string,
): Promise<SnapshotInfo> {
	const slug = slugify( name );
	if ( ! slug ) {
		throw new Error( 'Snapshot name is invalid.' );
	}

	const sqlDir = getSqlDir( site );
	await fs.ensureDir( sqlDir );

	const zipFile = `${ slug }.zip`;
	const zipPath = path.join( sqlDir, zipFile );

	if ( await fs.pathExists( zipPath ) ) {
		throw new Error( 'Snapshot name already exists.' );
	}

	const sqlFile = `${ slug }.sql`;
	const sqlPath = path.join( sqlDir, sqlFile );

	try {
		await wpCli.run( site, [ 'transient', 'delete', '--all' ] );
	} catch {
		// Non-fatal: transient cleanup can fail if DB isn't fully ready
	}

	await siteDatabase.dump( site, sqlPath );

	const zip = new AdmZip();
	zip.addLocalFile( sqlPath );
	zip.writeZip( zipPath );

	await fs.remove( sqlPath );

	const stat = await fs.stat( zipPath );
	return {
		filename: zipFile,
		name: slug,
		date: stat.mtimeMs,
		size: stat.size,
	};
}

export async function restoreSnapshot(
	siteDatabase: LocalMain.Services.SiteDatabase,
	site: Local.Site,
	filename: string,
): Promise<void> {
	const sqlDir = getSqlDir( site );
	const zipPath = path.join( sqlDir, filename );

	if ( ! ( await fs.pathExists( zipPath ) ) ) {
		throw new Error( 'Snapshot file not found.' );
	}

	const zip = new AdmZip( zipPath );
	zip.extractAllTo( sqlDir, true );

	const sqlFile = filename.replace( /\.zip$/, '.sql' );
	const sqlPath = path.join( sqlDir, sqlFile );

	if ( ! ( await fs.pathExists( sqlPath ) ) ) {
		throw new Error( 'Failed to extract snapshot SQL file.' );
	}

	try {
		const dbName = site.mysql?.database || 'local';
		await siteDatabase.exec( site, [ dbName, '-e', `source ${ sqlPath }` ] );
	} finally {
		await fs.remove( sqlPath );
	}
}

export async function deleteSnapshot( site: Local.Site, filename: string ): Promise<void> {
	const sqlDir = getSqlDir( site );
	const zipPath = path.join( sqlDir, filename );

	if ( ! ( await fs.pathExists( zipPath ) ) ) {
		throw new Error( 'Snapshot file not found.' );
	}

	await fs.remove( zipPath );
}
