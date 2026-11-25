import { type Badge, type BadgeKey, getBadgesFor, loadDonorBadges, subscribeBadgeLoad } from "./badges"
import Settings, { useBadgeSettings } from "./Settings"
import { type BadgesStorage, DEFAULTS, setStorage } from "./state"
import { getModules, instead, React, ReactNative as RN, withName } from "./valenced"
import { reportError, setReporter } from "../../../shared/report"

/**
 * Diagnostic switch. While true, every message header gets a small "[n]" marker (n = badges found)
 * so you can tell "patch isn't running" (no marker at all) from "patch runs but author has no badges"
 * (marker shows [0]). Set to false once badges show up.
 */
const DEBUG = true

function BadgeRow({ author }: { author: any }) {
	const storage = useBadgeSettings()
	const [, force] = React.useReducer((x: number) => x + 1, 0)
	React.useEffect(() => subscribeBadgeLoad(force), [])
	const badges = getBadgesFor(author, storage.shown)
	const flat: Badge[] = storage.order.flatMap((k: BadgeKey) => badges[k])

	if (!flat.length) {
		return DEBUG ? (
			<RN.Text style={{ color: "#888", fontSize: 10, marginLeft: 4 }}>[0]</RN.Text>
		) : null
	}

	return (
		<RN.View style={{ flexDirection: "row", alignItems: "center", marginLeft: 4 }}>
			{DEBUG && <RN.Text style={{ color: "#888", fontSize: 10, marginRight: 2 }}>[{flat.length}]</RN.Text>}
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

		let patched = false
		let logged = false
		const patchHeader = (module: any) => {
			if (patched) return
			const Header = module?.default ? module : undefined
			if (!Header || typeof Header.default !== "function") return
			patched = true
			if (DEBUG) console.log("[ShowBadgesInChat] patched message header")

			cleanup(
				instead(Header, "default", (args: any[], original: (...args: any[]) => any) => {
					const ret = original.apply(Header, args)
					const props = args[0]
					const author = props?.message?.author ?? props?.author
					if (DEBUG && !logged) {
						logged = true
						console.log(
							"[ShowBadgesInChat] header props keys:", Object.keys(props ?? {}),
							"author keys:", Object.keys(author ?? {}),
							"ret.props:", Object.keys(ret?.props ?? {}),
						)
					}
					if (!author || !ret?.props) return ret

					const children = ret.props.children
					const badge = <BadgeRow author={author} />
					ret.props.children = Array.isArray(children) ? [...children, badge] : [children, badge]
					return ret
				}),
			)
		}

		try {
			cleanup(
				getModules(withName("MessageHeader"), patchHeader, { returnNamespace: true }),
				getModules(withName("UserNameTitle"), patchHeader, { returnNamespace: true }),
			)
		} catch (error) {
			reportError("[ShowBadgesInChat] could not patch the message header:", error)
		}
	},
	SettingsComponent: Settings,
})
