import { React, ReactNative as RN } from "@valenced/modules/common"
import { findByName } from "@valenced/modules/finders"
import { after } from "@valenced/patcher"

import { type Badge, type BadgeKey, getBadgesFor, loadDonorBadges, subscribeBadgeLoad } from "./badges"
import Settings, { useBadgeSettings } from "./Settings"
import { type BadgesStorage, DEFAULTS, setStorage } from "./state"
import { reportError, setReporter } from "../../../shared/report"

function BadgeRow({ author }: { author: any }) {
	const storage = useBadgeSettings()
	const [, force] = React.useReducer((x: number) => x + 1, 0)
	React.useEffect(() => subscribeBadgeLoad(force), [])
	const badges = getBadgesFor(author, storage.shown)
	const flat: Badge[] = storage.order.flatMap((k: BadgeKey) => badges[k])
	if (!flat.length) return null

	return (
		<RN.View style={{ flexDirection: "row", alignItems: "center", marginLeft: 4 }}>
			{flat.map((b, i) => (
				<RN.Image
					key={`${b.key}-${i}`}
					source={{ uri: b.src }}
					accessibilityLabel={b.name}
					style={{ width: 16, height: 16, marginRight: 2 }}
				/>
			))}
		</RN.View>
	)
}

/**
 * ShowBadgesInChat: shows the message author's badges beside their name in chat.
 * Port of the Vencord/Equicord plugin by Inbestigator & KrystalSkull.
 */
export default plugin<{ jsonStorage: BadgesStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ jsonStorage, cleanup, plugin }) {
		setReporter(plugin)
		cleanup(() => setReporter(undefined))

		setStorage(jsonStorage)
		loadDonorBadges().catch(error => reportError("[ShowBadgesInChat] could not load donor badges:", error))

		try {
			// The component name can change between Discord versions; check the fallback if badges vanish.
			const Header = findByName("MessageHeader", false) ?? findByName("UserNameTitle", false)
			if (!Header) throw new Error("message header component not found")

			cleanup(
				after("default", Header, ([props]: any[], ret: any) => {
					const author = props?.message?.author ?? props?.author
					if (!author || !ret?.props) return ret

					const children = ret.props.children
					const badge = <BadgeRow author={author} />
					ret.props.children = Array.isArray(children) ? [...children, badge] : [children, badge]
					return ret
				}),
			)
		} catch (error) {
			reportError("[ShowBadgesInChat] could not patch the message header:", error)
		}
	},
	SettingsComponent: Settings,
})
