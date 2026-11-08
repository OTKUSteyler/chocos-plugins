import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { getRegistryEntry } from '../registry'
import { isEnabled, runtime } from '../state'
import type { TypingPluginApi } from '../state'

// modules/chat/native/TypingIndicator.tsx draws the row. For the single person typing it asks
//   TypingStore.getCustomTypingIndicatorConfig(userId)
// and, when that is not null, renders Discord's own CustomTypingIndicatorDisplay with it.
// So this patch alone makes Discord draw registry users' indicators natively.
export default function displayPatches(api: TypingPluginApi) {
	const { cleanup } = api

	cleanup(
		getModules(withProps<any>('getTypingUsers', 'getCustomTypingIndicatorConfig'), store => {
			runtime.found.typingStore = true
			cleanup(
				instead(
					store,
					'getCustomTypingIndicatorConfig',
					(args: any[], original: (...a: any[]) => any) => {
						// A real indicator from Discord (someone with Nitro) always wins.
						const native = Reflect.apply(original, store, args)
						if (native != null || !isEnabled()) return native
						return getRegistryEntry(args[0]) ?? null
					},
				),
			)
		}),
	)
}
