import * as native from '@valenced/modules/native'

/** Mirrored from native, which owns the real values (Sparkle needs them before JS has loaded). */
export interface CapriStorage {
	show: boolean
	/** 0 small, 1 medium, 2 large: the nearest stop to [sizeDp] (native keeps them in step). */
	size: number
	/** How big, in dp: the slider, which snaps to Small, Medium and Large. */
	sizeDp: number
	gravity: boolean
	wander: boolean
	talks: boolean
	/** 0: 1 minute, 1: 3 minutes, 2: 10 minutes, 3: never. */
	sleepAfter: number
	eat: boolean
	shake: boolean
	discord: boolean
	haptics: boolean
	/** Blows bubbles now and then, and when happy. */
	bubbles: boolean
	/** While bubbles are out, a swirling soap-film screen and pops that ripple it (overlay versions below Android 13). */
	bubbleFx: boolean
	/** Now and then casts a spell: VFX shows a random filter or effect for a few seconds. */
	magic: boolean
	/** How often magic, treats and eating happen: 1 Rare, 2 Sometimes, 3 Often, 4 Very often. */
	magicRate: number
	/** How lively it is between touches: 0 Calm, 1 Normal, 2 Lively, 3 Hyper. */
	activity: number
	treatRate: number
	eatRate: number
	/**
	 * What spells may show. JS-only (native never sees it; it goes to VFX with each spell).
	 * "block": everything except [spellList], so things VFX adds later are in. "allow": only [spellList].
	 */
	spellMode: "block" | "allow"
	/** VFX spell ids (`filter:crt`, `effect:ripple`, `particles:hearts`, `message:slam`). */
	spellList: string[]
	/** Message reactions (lib/moods.ts), JS-only like the spell list. Ids of reactions switched off. */
	moodsOff: string[]
	/** Keywords the user added, by reaction id. */
	moodAdded: Record<string, string[]>
	/** Built-in keywords the user removed, by reaction id. */
	moodRemoved: Record<string, string[]>
	/** Reactions also play their own full-screen effect (native ScreenFx.kt). */
	moodEffects: boolean
	/** Reaction ids whose full-screen effect is off. */
	moodFxOff: string[]
	/** 0: always on screen. 1: only while the keyboard is up. */
	showWhen: number
	/** Now and then a treat drops in; tap it to feed it. */
	treats: boolean
	/** What it calls itself. */
	name: string
	/** 0 no outline, 1 automatic (contrasts with the theme), 2 light, 3 dark. */
	outline: number
	/** Opt-in reputation: how it treats your buttons follows how you treat it (see Pet.kt, reputation). */
	grudges: boolean
}

export interface NativeState extends CapriStorage {
	pets: number
	eaten: number
	treatsEaten: number
	/** Happiness, 0..100. */
	love: number
	/** Reputation, -100..100: how it feels about you. Only moves while [grudges] is on. */
	rep?: number
	state: string
}

export const DEFAULTS: CapriStorage = {
	show: true,
	size: 1,
	sizeDp: 64,
	gravity: false,
	wander: true,
	talks: true,
	sleepAfter: 1,
	eat: true,
	shake: true,
	discord: true,
	haptics: true,
	bubbles: true,
	bubbleFx: true,
	magic: false,
	magicRate: 2,
	activity: 1,
	treatRate: 2,
	eatRate: 2,
	spellMode: "block",
	spellList: [],
	moodsOff: [],
	moodAdded: {},
	moodRemoved: {},
	moodEffects: false,
	moodFxOff: [],
	showWhen: 0,
	treats: true,
	name: "Capri",
	outline: 1,
	grudges: false,
}

/** The size slider: its range and the stops it snaps to (native's SIZE_DP). */
export const SIZE = { min: 40, max: 110, snap: 3 } as const
export const SIZE_STOPS = [
	{ label: "Small", dp: 52 },
	{ label: "Medium", dp: 64 },
	{ label: "Large", dp: 80 },
] as const

/** "Medium", or "Between Medium and Large" off the stops. */
export function sizeLabel(dp: number): string {
	const stop = SIZE_STOPS.find(s => s.dp === dp)
	if (stop) return stop.label
	if (dp < SIZE_STOPS[0].dp) return "Smaller than Small"
	if (dp > SIZE_STOPS[SIZE_STOPS.length - 1].dp) return "Bigger than Large"
	const above = SIZE_STOPS.findIndex(s => s.dp > dp)
	return `Between ${SIZE_STOPS[above - 1].label} and ${SIZE_STOPS[above].label}`
}

/** Capri, the only pet. */
export const PET = { label: "Capri", defaultName: "Capri", leaves: "teleports away" } as const

const METHOD = "com.otkusteyler.capri-pet"

/** Same bridge call as VFX and Focus Bubble. */
export function callNative(name: string, args: any[] = []): Promise<any> {
	return (native as any).callNativeMethod(`${METHOD}.${name}`, args)
}
