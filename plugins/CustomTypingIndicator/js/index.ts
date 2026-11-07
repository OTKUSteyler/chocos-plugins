import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { getErrorStack } from '@valenced/utils/error'
import { clearData, fetchRegistry } from './data'
import renderPatches from './patches/render'
import { SettingsComponent } from './settings'
import { runtime } from './state'
import type { ApiOptions, ProductCatalog } from './state'
import type { PluginApi } from '@valenced/plugins/types'

export type { ApiOptions } from './state'

export default plugin<ApiOptions>({
	jsonStorage: {
		load: true,
		default: {
			enabled: true,
			mine: { emojis: [], animation: 'wave', text: 'is typing...' },
			emojiPool: [],
		},
	},

	async start(api: PluginApi<ApiOptions>) {
		const { cleanup } = api
		runtime.api = api

		cleanup(
			// modules/premium/ProductCatalog.tsx
			getModules(withProps<ProductCatalog>('canUserUse'), Catalog => {
				runtime.catalog = Catalog
				// Bound BEFORE patching: this is Discord's real answer, which is how
				// the plugin knows whether you actually have Nitro and must step aside.
				runtime.canActuallyUse = Catalog.canUserUse.bind(Catalog)

				// Feature constants whose name mentions typing (names vary by build).
				const names = Object.keys(Catalog).filter(k => /typing/i.test(k))
				runtime.typingFeatures = names.map(k => Catalog[k])
				// Helps pick the right finders/constants if nothing matched.
				console.log('[typing-indicator] candidates', names)

				cleanup(
					instead(Catalog, 'canUserUse', function (this: ProductCatalog, args, orig) {
						// Unlock the native customization screen only for people without Nitro.
						// With Nitro, the original answer (true) is returned untouched.
						if (api.jsonStorage.cache?.enabled && runtime.typingFeatures.includes(args[0])) return true
						return Reflect.apply(orig, this, args)
					}),
				)
			}),
		)

		try {
			renderPatches(api)
		} catch (e) {
			api.plugin.reportError(`Failed to apply render patches: ${getErrorStack(e)}`)
		}

		await fetchRegistry()
		cleanup(() => {
			clearData()
			runtime.api = null
			runtime.catalog = null
			runtime.canActuallyUse = null
			runtime.typingFeatures = []
		})
	},

	SettingsComponent,
})
