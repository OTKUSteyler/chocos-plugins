import { createElement } from 'react'
import { View } from 'react-native'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import TypingStrip from '../components/TypingStrip'
import { resolveEntry, runtime } from '../state'
import type { TypingPluginApi } from '../state'

// ⚠️ UNVERIFIED FINDERS. I can't inspect your Discord build, so these prop names are
// guesses. Check the startup log ("[typing-indicator] candidates") and swap them.
const TYPING_TEXT_PROP = 'getTypingText' // formats the "X is typing..." string
const TYPING_ROW_PROP = 'TypingIndicator' // the component that renders that row

export default function renderPatches(api: TypingPluginApi) {
	const { cleanup } = api

	cleanup(
		// current user id, so we know which indicator is "mine"
		getModules(withProps<{ getCurrentUser(): any }>('getCurrentUser'), store => {
			runtime.currentUserId = store.getCurrentUser()?.id ?? null
		}),

		// text: "<name> <custom text>" when exactly one registered user is typing
		getModules(withProps<any>(TYPING_TEXT_PROP), mod => {
			cleanup(
				instead(mod, TYPING_TEXT_PROP, (args: any[], original: (...a: any[]) => any) => {
					const users: any[] = args[0] ?? []
					if (users.length === 1) {
						const entry = resolveEntry(users[0]?.id)
						if (entry?.text) {
							const name = users[0].globalName ?? users[0].username ?? ''
							return `${name} ${entry.text}`
						}
					}
					return Reflect.apply(original, mod, args)
				}),
			)
		}),

		// emoji strip + animation in front of the row
		getModules(withProps<any>(TYPING_ROW_PROP), mod => {
			cleanup(
				instead(mod, TYPING_ROW_PROP, (args: any[], original: (...a: any[]) => any) => {
					const row = Reflect.apply(original, mod, args)
					const typing = args[0]?.typingUsers ?? args[0]?.users
					const first = Array.isArray(typing) && typing.length === 1 ? typing[0] : undefined
					const entry = resolveEntry(first?.id)
					if (!entry?.emojis.length) return row

					return createElement(
						View,
						{ style: { flexDirection: 'row', alignItems: 'center' } },
						createElement(TypingStrip, { entry }),
						row,
					)
				}),
			)
		}),
	)
}
