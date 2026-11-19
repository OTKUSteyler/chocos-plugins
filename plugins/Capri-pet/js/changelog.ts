import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '2.0.0',
		date: '2026-11-19',
		title: 'Capri-Pet rewrite',
		changes: [
			'Capri is now a pixel-art pet that lives on top of Discord. Tap, pet, feed, shake and throw her.',
			'Replaces the old floating cyber-kitten completely.',
		],
	},
]
