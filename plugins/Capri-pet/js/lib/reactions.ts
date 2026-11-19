import { callNative } from "../native"
import { savedSettings } from "../ui/state"
import { fxOn, matchMood } from "./moods"
import * as flux from "@valenced/discord/flux"
import { Stores } from "@valenced/discord/flux"
import { reportError } from "../../../../shared/report"

/**
 * Discord events Capri reacts to. Native decides whether to (the Discord switch, and whether
 * Capri is free to react) and how; this only spots the events and names them:
 *
 * - `sent` / `essay`: you sent a message (an essay past 300 characters).
 * - `mention`: someone mentioned you. `mail`: a DM arrived in a channel you don't have open.
 * - a message reaction (`love`, `laugh`, `hi`, `bye`, `sad`... see lib/moods.ts): a keyword in a
 *   message in your open channel or a DM. The matched keyword goes along as the name.
 * - `channel_new` / `channel_again`: you opened a channel, the first time this session or not.
 * - `voice_join` / `voice_leave`: you joined or left a voice channel.
 *
 * Message handling follows VFX's triggers.ts: your own sends are recognised by the optimistic
 * MESSAGE_CREATE, so the server's echo never counts twice.
 */

const DM_TYPES = new Set([1, 3])

function stores(): any {
	return Stores as any
}

function react(kind: string, name?: string, fx = false) {
	callNative("react", [kind, name ?? null, fx]).catch(error =>
		reportError("[Capri] react failed:", error),
	)
}


function channelName(channelId: string): string | undefined {
	const s = stores()
	const channel = s.ChannelStore?.getChannel?.(channelId)
	if (!channel) return undefined
	if (channel.name) return `#${channel.name}`.slice(0, 24)
	const other = channel.recipients?.[0] ?? channel.rawRecipients?.[0]?.id
	const user = typeof other === "string" ? s.UserStore?.getUser?.(other) : other
	const name = user?.globalName ?? user?.global_name ?? user?.username
	return typeof name === "string" ? name.slice(0, 20) : undefined
}

export function watchDiscord(): () => void {
	const { onFluxEventDispatched } = flux
	const undo: Array<() => void> = []
	let nextIncoming = 0
	let nextSent = 0
	let nextChannel = 0
	const visits = new Map<string, number>()
	// Patches, not listeners: each MUST return the payload (docs/porting-rules.md rule 2).
	undo.push(
		onFluxEventDispatched("MESSAGE_CREATE", (payload: any) => {
			try {
				const message = payload?.message
				const me = stores().UserStore?.getCurrentUser?.()?.id
				if (!message || !me) return payload
				const now = Date.now()
				if (message.author?.id === me) {
					if ((payload.optimistic || message.state === "SENDING") && now >= nextSent) {
						nextSent = now + 1500
						react(String(message.content ?? "").length > 300 ? "essay" : "sent")
					}
					return payload
				}
				if (payload.optimistic || now < nextIncoming) return payload
				const channelId = String(payload.channelId ?? message.channel_id ?? "")
				const open = stores().SelectedChannelStore?.getChannelId?.() === channelId
				const dm = DM_TYPES.has(stores().ChannelStore?.getChannel?.(channelId)?.type)
				const mentioned = (message.mentions ?? []).some(
					(m: any) => (typeof m === "string" ? m : m?.id) === me,
				)
				const feeling = open || dm ? matchMood(savedSettings(), message.content) : undefined
				const kind = mentioned ? "mention" : (feeling?.id ?? (dm && !open ? "mail" : undefined))
				if (!kind) return payload
				nextIncoming = now + (feeling ? 3000 : 6000)
				const own = !!feeling && kind === feeling.id
				react(kind, own ? feeling.word.slice(0, 20) : undefined, own && fxOn(savedSettings(), kind))
			} catch (error) {
				reportError("[Capri] MESSAGE_CREATE handler failed:", error)
			}
			return payload
		}),
	)

	undo.push(
		onFluxEventDispatched("CHANNEL_SELECT", (payload: any) => {
			try {
				const channelId = payload?.channelId ? String(payload.channelId) : ""
				if (!channelId) return payload
				const seen = (visits.get(channelId) ?? 0) + 1
				visits.set(channelId, seen)
				if (visits.size > 200) {
					const oldest = visits.keys().next().value
					if (oldest !== undefined) visits.delete(oldest)
				}
				const now = Date.now()
				if (now < nextChannel) return payload
				nextChannel = now + 25000
				react(seen > 1 ? "channel_again" : "channel_new", channelName(channelId))
			} catch (error) {
				reportError("[Capri] CHANNEL_SELECT handler failed:", error)
			}
			return payload
		}),
	)

	undo.push(
		onFluxEventDispatched("VOICE_CHANNEL_SELECT", (payload: any) => {
			try {
				react(payload?.channelId ? "voice_join" : "voice_leave")
			} catch (error) {
				reportError("[Capri] VOICE_CHANNEL_SELECT handler failed:", error)
			}
			return payload
		}),
	)

	return () => {
		for (const fn of undo) fn()
	}
}
