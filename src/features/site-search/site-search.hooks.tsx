/**
 * site-search.hooks.tsx -- Sidebar site search with live filtering.
 *
 * Places a sticky search input above the site list via the
 * SitesSidebar_SiteList:Before content hook. Filters site entries
 * by toggling DOM visibility on each keystroke, matching against
 * both the site name (from data-site-name attribute) and the site
 * domain/URL (fetched from GraphQL on mount).
 *
 * DOM strategy: the sidebar has a <nav id="SiteList"> that scrolls
 * (overflow-y: auto). Site items are classless div[draggable="true"]
 * elements; group wrappers are also draggable but carry class names.
 * Each visible site element has a child with data-site-id.
 */

import * as LocalRenderer from '@getflywheel/local/renderer';
import { InputSearch } from '@getflywheel/local-components';

let React: typeof import( 'react' );

/** Map of siteId -> lowercase domain, populated from GraphQL on mount. */
let domainMap: Record<string, string> = {};

/**
 * Registers the site search input into the sidebar.
 *
 * @param _React - React instance from the addon context.
 * @param hooks  - HooksRenderer instance for registering hooks.
 */
export function registerSiteSearchHooks(
	_React: typeof import( 'react' ),
	hooks: typeof LocalRenderer.HooksRenderer,
): void {
	React = _React;

	hooks.addContent( 'SitesSidebar_SiteList:Before', () => (
		<SiteSearchInput key="supercharged-site-search" />
	) );
}

/**
 * Fetches all sites from GraphQL and builds a siteId -> domain lookup.
 */
async function buildDomainMap(): Promise<void> {
	try {
		const gql = ( LocalRenderer as any ).gql;
		const client = ( LocalRenderer as any ).localApolloClient;
		if ( ! client || ! gql ) return;

		const result = await client.query( {
			query: gql`{ sites { id domain } }`,
			fetchPolicy: 'cache-first',
		} );

		const sites: Array<{ id: string; domain: string }> = result?.data?.sites || [];
		const map: Record<string, string> = {};

		for ( const site of sites ) {
			if ( site.id && site.domain ) {
				map[ site.id ] = site.domain.toLowerCase();
			}
		}

		domainMap = map;
	} catch {
		// GraphQL unavailable -- name-only search still works
	}
}

/**
 * Finds all site item elements inside the sidebar site list.
 *
 * Site items are classless div[draggable="true"] inside <nav id="SiteList">.
 * Group wrappers (SiteListGroup_Wrapper) are also draggable but carry
 * class names, so checking for an empty className isolates site entries.
 */
function getSiteItems(): HTMLElement[] {
	const nav = document.getElementById( 'SiteList' );
	if ( ! nav ) return [];

	const all = nav.querySelectorAll( 'div[draggable="true"]' );
	const items: HTMLElement[] = [];

	for ( let i = 0; i < all.length; i++ ) {
		const el = all[ i ] as HTMLElement;
		if ( ! el.className ) {
			items.push( el );
		}
	}

	return items;
}

/**
 * Toggles visibility of site items that don't match the search term.
 * Matches against site name (data-site-name) and domain (from GraphQL).
 * An empty term restores all items.
 */
function filterSiteList( term: string ): void {
	const normalizedTerm = term.toLowerCase().trim();
	const items = getSiteItems();

	for ( const item of items ) {
		if ( ! normalizedTerm ) {
			item.style.display = '';
			continue;
		}

		// Check site name from data attribute (faster than textContent)
		const siteEl = item.querySelector( '[data-site-id]' ) as HTMLElement | null;
		const siteName = ( siteEl?.getAttribute( 'data-site-name' ) || '' ).toLowerCase();
		const siteId = siteEl?.getAttribute( 'data-site-id' ) || '';
		const siteDomain = domainMap[ siteId ] || '';

		const matches = siteName.includes( normalizedTerm ) || siteDomain.includes( normalizedTerm );
		item.style.display = matches ? '' : 'none';
	}
}

/**
 * Sticky search input for filtering the sidebar site list.
 * Fetches site domains on mount and filters by name + domain on keystroke.
 */
function SiteSearchInput() {
	const { useState, useCallback, useEffect } = React;

	const [ value, setValue ] = useState( '' );

	// Fetch site domains on mount.
	useEffect( () => {
		buildDomainMap();
	}, [] );

	const handleChange = useCallback( ( e: any ) => {
		const newValue = e?.target?.value ?? '';
		setValue( newValue );
		requestAnimationFrame( () => filterSiteList( newValue ) );
	}, [] );

	// Restore full visibility on unmount.
	useEffect( () => {
		return () => filterSiteList( '' );
	}, [] );

	return (
		<div style={ {
			position: 'sticky',
			top: 0,
			zIndex: 10,
			backgroundColor: '#262727',
			padding: '10px 15px',
			marginTop: '10px',
		} }>
			<InputSearch
				placeholder="Search sites..."
				value={ value }
				onChange={ handleChange }
			/>
		</div>
	);
}
