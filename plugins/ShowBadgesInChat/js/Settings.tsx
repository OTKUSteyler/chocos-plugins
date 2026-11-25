import { FormSwitch, React, ReactNative as RN } from "./valenced"

import type { BadgeKey } from "./badges"
import { getStorage, move, setShown, subscribe } from "./state"

const LABELS: Record<BadgeKey, string> = {
	EquicordDonor: "Equicord donor badges",
	VencordDonor: "Vencord donor badges",
	DiscordProfile: "Discord profile badges (HypeSquad, Staff, Early Supporter, ...)",
	DiscordNitro: "Nitro badge",
}

export function useBadgeSettings() {
	const [, force] = React.useReducer((x: number) => x + 1, 0)
	React.useEffect(() => subscribe(force), [])
	return getStorage()
}

export default function Settings() {
	const storage = useBadgeSettings()
	const last = storage.order.length - 1

	return (
		<RN.ScrollView>
			<RN.View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
				<RN.Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 8 }}>Badges</RN.Text>
				<RN.Text style={{ paddingBottom: 8 }}>
					Toggle which badges show next to usernames, and use the arrows to reorder them (top = leftmost).
				</RN.Text>
				{storage.order.map((key, i) => (
					<RN.View
						key={key}
						style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}
					>
						<RN.Text style={{ flex: 1, marginRight: 8 }}>{LABELS[key]}</RN.Text>
						<RN.View style={{ flexDirection: "row", alignItems: "center" }}>
							<RN.TouchableOpacity
								disabled={i === 0}
								onPress={() => move(i, -1)}
								accessibilityLabel={`Move ${LABELS[key]} left`}
								style={{ padding: 8, opacity: i === 0 ? 0.3 : 1 }}
							>
								<RN.Text style={{ color: "#fff", fontSize: 18 }}>◀</RN.Text>
							</RN.TouchableOpacity>
							<RN.TouchableOpacity
								disabled={i === last}
								onPress={() => move(i, 1)}
								accessibilityLabel={`Move ${LABELS[key]} right`}
								style={{ padding: 8, opacity: i === last ? 0.3 : 1 }}
							>
								<RN.Text style={{ color: "#fff", fontSize: 18 }}>▶</RN.Text>
							</RN.TouchableOpacity>
							<FormSwitch value={storage.shown[key]} onValueChange={(v: boolean) => setShown(key, v)} />
						</RN.View>
					</RN.View>
				))}
			</RN.View>
		</RN.ScrollView>
	)
}
