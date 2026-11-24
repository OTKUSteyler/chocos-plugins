import { reportError } from '../../../shared/report'

export type BadgeKey = 'EquicordDonor' | 'VencordDonor' | 'DiscordProfile' | 'DiscordNitro'

export interface Badge {
	key: BadgeKey
	name: string
	src: string
}

export type BadgeMap = Record<BadgeKey, Badge[]>

interface AuthorLike {
	id?: string
	flags?: number
	publicFlags?: number
	premiumType?: number
}

interface DonorBadge {
	tooltip?: string
	badge: string
}

type DonorBadgeMap = Record<string, DonorBadge[]>

const VENCORD_URL = 'https://badges.vencord.dev/badges.json'
const EQUICORD_URL = 'https://badge.equicord.org/badges.json'
const DISCORD_ICON_URL = 'https://cdn.discordapp.com/badge-icons'
const NITRO_ICON = `${DISCORD_ICON_URL}/2ba85e8026a8614b640c2837bcdfe21b.png`

const DISCORD_BADGES: ReadonlyArray<readonly [number, string, string]> = [
	[0, 'Discord Staff', '5e74e9b61934fc1f67c65515d1f7e60d'],
	[1, 'Partnered Server Owner', '3f9748e53446a137a052f3454e2de41e'],
	[2, 'HypeSquad Events', 'bf01d1073931f921909045f3a39fd264'],
	[6, 'HypeSquad Bravery', '8a88d63823d8a71cd5e390baa45efa02'],
	[7, 'HypeSquad Brilliance', '011940fd013da3f7fb926e4a1cd2e618'],
	[8, 'HypeSquad Balance', '3aa41de486fa12454c3761e8e223442e'],
	[3, 'Discord Bug Hunter', '2717692c7dca7289b35297368a940dd0'],
	[14, 'Discord Bug Hunter', '848f79194d4be5ff5f81505cbd0ce1e6'],
	[17, 'Early Verified Bot Developer', '6df5892e0f35b051f8b61eace34f4967'],
	[9, 'Early Supporter', '7060786766c9c840eb3019e725d2b358'],
	[18, 'Moderator Programs Alumni', 'fee1624003e2fee35cb398e125dc479b'],
]

let vencordDonors: DonorBadgeMap = {}
let equicordDonors: DonorBadgeMap = {}

const listeners = new Set<() => void>()

function isDonorMap(data: unknown): data is DonorBadgeMap {
	if (!data || typeof data !== 'object' || Array.isArray(data)) return false
	return Object.values(data).every(
		list =>
			Array.isArray(list) &&
			list.every(
				badge => !!badge && typeof badge === 'object' && typeof badge.badge === 'string',
			),
	)
}

async function fetchDonorMap(url: string): Promise<DonorBadgeMap> {
	const response = await fetch(url, { cache: 'no-store' })
	if (!response.ok) throw new Error(`HTTP ${response.status}`)

	const data: unknown = await response.json()
	if (!isDonorMap(data)) throw new Error('Unexpected donor badge JSON format')

	return data
}

export async function loadDonorBadges(): Promise<void> {
	const [vencord, equicord] = await Promise.allSettled([
		fetchDonorMap(VENCORD_URL),
		fetchDonorMap(EQUICORD_URL),
	])

	if (vencord.status === 'fulfilled') vencordDonors = vencord.value
	else reportError('[ShowBadgesInChat] Vencord donor badges failed:', vencord.reason)

	if (equicord.status === 'fulfilled') equicordDonors = equicord.value
	else reportError('[ShowBadgesInChat] Equicord donor badges failed:', equicord.reason)

	for (const fn of listeners) fn()
}

export function subscribeBadgeLoad(fn: () => void): () => void {
	listeners.add(fn)
	return () => void listeners.delete(fn)
}

function donorBadges(
	data: DonorBadgeMap,
	author: AuthorLike,
	key: 'VencordDonor' | 'EquicordDonor',
): Badge[] {
	if (!author.id) return []

	return (data[author.id] ?? []).map(badge => ({
		key,
		name: badge.tooltip ?? (key === 'VencordDonor' ? 'Vencord donor' : 'Equicord donor'),
		src: badge.badge,
	}))
}

function profileBadges(author: AuthorLike): Badge[] {
	const flags = Number(author.flags ?? author.publicFlags ?? 0)
	if (!Number.isFinite(flags)) return []

	return DISCORD_BADGES.filter(([bit]) => (flags & (1 << bit)) !== 0).map(([, name, icon]) => ({
		key: 'DiscordProfile' as const,
		name,
		src: `${DISCORD_ICON_URL}/${icon}.png`,
	}))
}

function nitroBadges(author: AuthorLike): Badge[] {
	const premiumType = Number(author.premiumType ?? 0)
	if (!premiumType) return []

	const suffix = premiumType === 3 ? ' Basic' : premiumType === 1 ? ' Classic' : ''
	return [{ key: 'DiscordNitro', name: `Discord Nitro${suffix}`, src: NITRO_ICON }]
}

export function getBadgesFor(author: AuthorLike | undefined, shown: Record<BadgeKey, boolean>): BadgeMap {
	if (!author) {
		return { EquicordDonor: [], VencordDonor: [], DiscordProfile: [], DiscordNitro: [] }
	}

	return {
		EquicordDonor: shown.EquicordDonor ? donorBadges(equicordDonors, author, 'EquicordDonor') : [],
		VencordDonor: shown.VencordDonor ? donorBadges(vencordDonors, author, 'VencordDonor') : [],
		DiscordProfile: shown.DiscordProfile ? profileBadges(author) : [],
		DiscordNitro: shown.DiscordNitro ? nitroBadges(author) : [],
	}
}
