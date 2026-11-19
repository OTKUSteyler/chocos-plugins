import type { CapriStorage } from "../native"

/**
 * Message reactions: which words in a message make the pet react, and how. Matching happens here in
 * JS; native only gets the reaction's id (`react(kind, word)`) and plays it (Pet.react).
 *
 * Every reaction has built-in keywords. Users can remove any of them (kept in `moodRemoved`, so they
 * can be brought back and new built-ins from an update still arrive), add their own (`moodAdded`),
 * and switch a reaction off (`moodsOff`). Order matters: the first reaction with a match wins.
 */
export interface Mood {
	id: string
	label: string
	/** What the pet does, for the settings rows. */
	does: string
	/** Its full-screen effect, for the settings rows. */
	fx: string
	words: string[]
}

export const MOODS: Mood[] = [
	{
		id: "love",
		label: "Love",
		does: "Heart bubble, floating hearts, then blows bubbles",
		fx: "Pixel hearts float up the screen",
		words: ["❤", "♥", "💕", "💖", "💗", "😘", "😍", "🥰", "<3", "love", "ily", "ilysm", "luv", "xoxo", "adore"],
	},
	{
		id: "laugh",
		label: "Laugh",
		does: "A happy hop and sparkles",
		fx: "“HA”s pop up all over",
		words: ["haha", "hahaha", "hehe", "lol", "lmao", "lmfao", "rofl", "kek", "😂", "🤣", "💀", "😆"],
	},
	{
		id: "hi",
		label: "Hello",
		does: "Waves hello",
		fx: "A wave of sparkles sweeps across",
		words: ["hi", "hey", "hello", "heya", "hiya", "yo", "sup", "howdy", "good morning", "gm", "👋"],
	},
	{
		id: "bye",
		label: "Goodbye",
		does: "A sad little goodbye",
		fx: "Petals drift down and away",
		words: ["bye", "goodbye", "cya", "see ya", "see you", "ttyl", "gtg", "gotta go", "brb", "peace out"],
	},
	{
		id: "sleepy",
		label: "Sleepy",
		does: "Dozes off for a moment",
		fx: "The screen dims and z's float up",
		words: ["gn", "goodnight", "good night", "night night", "sleepy", "tired", "bedtime", "nap", "😴", "💤", "🥱"],
	},
	{
		id: "sad",
		label: "Sad",
		does: "Looks sad and offers a hug",
		fx: "Rain falls with a blue tint",
		words: ["sad", "rip", "sorry", ":(", ":'(", "😢", "😭", "🥺", "💔"],
	},
	{
		id: "wow",
		label: "Surprised",
		does: "Jumps in surprise",
		fx: "Speed lines burst out from the pet",
		words: ["wow", "omg", "whoa", "woah", "no way", "wtf", "holy", ":o", "😮", "😱", "🤯"],
	},
	{
		id: "party",
		label: "Celebrate",
		does: "A big hop, sparkles, a chime and bubbles",
		fx: "Confetti rains down",
		words: ["yay", "congrats", "congratulations", "woohoo", "happy birthday", "hbd", "gg", "🎉", "🥳", "🎊", "🎂"],
	},
	{
		id: "cool",
		label: "Hype",
		does: "Puts its sunglasses on",
		fx: "Stars glint all over the screen",
		words: ["let's go", "lets go", "pog", "poggers", "hype", "fire", "sick", "based", "🔥", "😎", "🤩"],
	},
	{
		id: "food",
		label: "Food",
		does: "Gets hungry and asks for some",
		fx: "Pizza, cookies and doughnuts fall and bounce",
		words: ["food", "hungry", "snack", "snacks", "pizza", "cookie", "cake", "burger", "fries", "ramen", "sushi", "taco", "🍕", "🍪", "🍔", "🍩", "🍰"],
	},
	{
		id: "music",
		label: "Music",
		does: "Music bubble and a chime",
		fx: "Music notes float up",
		words: ["song", "music", "playlist", "album", "concert", "spotify", "🎵", "🎶", "🎧", "🎤"],
	},
	{
		id: "thanks",
		label: "Thanks",
		does: "Holds up a heart",
		fx: "Hearts and sparkles burst out from the pet",
		words: ["thanks", "thank you", "ty", "tysm", "thx", "appreciate it", "🙏"],
	},
]

type MoodSettings = Pick<CapriStorage, "moodsOff" | "moodAdded" | "moodRemoved">

/** Whether a reaction plays its full-screen effect (native ScreenFx.kt): the main switch, then its own. */
export function fxOn(s: Pick<CapriStorage, "moodEffects" | "moodFxOff">, id: string): boolean {
	return !!s.moodEffects && !(s.moodFxOff ?? []).includes(id)
}

export const moodById = (id: string) => MOODS.find(mood => mood.id === id)

/** Case-insensitive, trimmed: how keywords are compared and stored. */
export const keyOf = (word: string) => word.trim().toLowerCase()

/** A reaction's keywords right now: built-ins minus the removed ones, then the user's own. */
export function wordsOf(s: MoodSettings, id: string): { word: string; builtIn: boolean }[] {
	const removed = new Set((s.moodRemoved?.[id] ?? []).map(keyOf))
	const builtIn = (moodById(id)?.words ?? []).filter(word => !removed.has(keyOf(word)))
	const seen = new Set(builtIn.map(keyOf))
	const added = (s.moodAdded?.[id] ?? []).filter(word => {
		const key = keyOf(word)
		if (!key || seen.has(key)) return false
		seen.add(key)
		return true
	})
	return [...builtIn.map(word => ({ word, builtIn: true })), ...added.map(word => ({ word, builtIn: false }))]
}

/** Built-in keywords the user removed from a reaction. */
export function removedOf(s: MoodSettings, id: string): string[] {
	const removed = new Set((s.moodRemoved?.[id] ?? []).map(keyOf))
	return (moodById(id)?.words ?? []).filter(word => removed.has(keyOf(word)))
}

/** The reaction that has this keyword, if any. */
export function ownerOf(s: MoodSettings, word: string): string | undefined {
	const key = keyOf(word)
	return MOODS.find(mood => wordsOf(s, mood.id).some(entry => keyOf(entry.word) === key))?.id
}

/** The settings change that takes a keyword off a reaction. */
export function withoutWord(s: MoodSettings, id: string, word: string): Partial<MoodSettings> {
	const key = keyOf(word)
	const isBuiltIn = (moodById(id)?.words ?? []).some(w => keyOf(w) === key)
	if (isBuiltIn) {
		const removed = s.moodRemoved?.[id] ?? []
		return { moodRemoved: { ...s.moodRemoved, [id]: [...removed.filter(w => keyOf(w) !== key), word] } }
	}
	return { moodAdded: { ...s.moodAdded, [id]: (s.moodAdded?.[id] ?? []).filter(w => keyOf(w) !== key) } }
}

/**
 * The settings change that gives a keyword to a reaction, taking it off whichever reaction had it, so
 * one word always means one reaction. A removed built-in comes back rather than being added twice.
 */
export function withWord(s: MoodSettings, id: string, word: string): Partial<MoodSettings> {
	const key = keyOf(word)
	let next: MoodSettings = { moodsOff: s.moodsOff, moodAdded: { ...s.moodAdded }, moodRemoved: { ...s.moodRemoved } }
	const owner = ownerOf(next, word)
	if (owner === id) return {}
	if (owner) next = { ...next, ...withoutWord(next, owner, word) }
	if ((moodById(id)?.words ?? []).some(w => keyOf(w) === key)) {
		next.moodRemoved = { ...next.moodRemoved, [id]: (next.moodRemoved[id] ?? []).filter(w => keyOf(w) !== key) }
	} else {
		next.moodAdded = { ...next.moodAdded, [id]: [...(next.moodAdded[id] ?? []), word.trim()] }
	}
	return { moodAdded: next.moodAdded, moodRemoved: next.moodRemoved }
}

function escape(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * One keyword as a pattern. Letters may be stretched ("hiii", "loool", "byeee") and the whole word
 * repeated ("hahahaha"). Whole words only where the keyword starts or ends with a letter, so "hi"
 * never fires on "this" and "yo" never on "you"; emoji and ":(" match anywhere.
 */
function patternOf(word: string): string {
	const plain = keyOf(word)
	const body = Array.from(plain)
		.map(char => (/\w/.test(char) ? `${escape(char)}+` : escape(char)))
		.join("")
	const start = /^\w/.test(plain) ? "\\b" : ""
	const end = /\w$/.test(plain) ? "\\b" : ""
	return `${start}(?:${body})+${end}`
}

/** Compiled per distinct settings, not per message: messages arrive in bursts. */
let compiled: { key: string; list: { id: string; tests: { word: string; pattern: RegExp }[] }[] } | undefined

function compile(s: MoodSettings) {
	const key = JSON.stringify([s.moodsOff, s.moodAdded, s.moodRemoved])
	if (compiled?.key === key) return compiled.list
	const off = new Set(s.moodsOff ?? [])
	const list = MOODS.filter(mood => !off.has(mood.id)).map(mood => ({
		id: mood.id,
		tests: wordsOf(s, mood.id).flatMap(({ word }) => {
			try {
				return [{ word, pattern: new RegExp(patternOf(word), "i") }]
			} catch {
				return []
			}
		}),
	}))
	compiled = { key, list }
	return list
}

/** The first reaction a message matches, and the keyword that matched it. */
export function matchMood(s: MoodSettings, text: unknown): { id: string; word: string } | undefined {
	if (typeof text !== "string" || !text) return undefined
	const sample = text.slice(0, 400)
	for (const mood of compile(s)) {
		const hit = mood.tests.find(test => test.pattern.test(sample))
		if (hit) return { id: mood.id, word: hit.word }
	}
	return undefined
}
