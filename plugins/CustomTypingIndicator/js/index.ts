import { getErrorStack } from '@valenced/utils/error'
import previewPatches from './patches/preview'
import unlockPatches from './patches/unlock'
import { SettingsComponent } from './settings'
import { runtime } from './state'
import type { ApiOptions } from './state'
import type { PluginApi } from '@valenced/plugins/types'

export type { ApiOptions } from './state'

export default plugin<ApiOptions>({
	jsonStorage: {
		load: true,
		default: {
			enabled: true,
			unlockEditor: true,
			mine: null,
			previewOwn: true,
		},
	},

	start(api: PluginApi<ApiOptions>) {
		const { cleanup } = api
		runtime.api = api

		for (const apply of [unlockPatches, previewPatches]) {
			try {
				apply(api)
			} catch (e) {
				api.plugin.reportError(`Failed to apply ${apply.name}: ${getErrorStack(e)}`)
			}
		}

		cleanup(() => {
			runtime.api = null
			runtime.canActuallyUse = null
			runtime.getCurrentUserRaw = null
			runtime.emitUserChange = null
			runtime.emitDevChange = null
			for (const key of Object.keys(runtime.found) as (keyof typeof runtime.found)[]) {
				runtime.found[key] = false
			}
		})
	},

	SettingsComponent,
})
