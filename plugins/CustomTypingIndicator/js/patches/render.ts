import { getStore } from '@valenced/discord/flux'
import { runtime } from '../state'
import type { TypingPluginApi } from '../state'

interface UserStore {
	getCurrentUser(): { id?: string } | null
}

/**
 * Initialize user identity through Valenced's supported Flux store accessor.
 *
 * The previous implementation patched guessed exports named `getTypingText` and
 * `TypingIndicator`. Those names are not part of Discord's public contract and
 * silently missed the actual render path. We intentionally do not install those
 * speculative patches. The settings route is registered separately in index.ts.
 */
export default function renderPatches(api: TypingPluginApi) {
	api.cleanup(
		getStore<UserStore>('UserStore', store => {
			runtime.currentUserId = store.getCurrentUser()?.id ?? null
		}),
		() => {
			runtime.currentUserId = null
		},
	)
}
