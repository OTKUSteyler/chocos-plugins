import { PET } from "../../native"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import { update, useNativeState, useSettings } from "../state"
import * as components from "@valenced/components"
import { Design } from "@valenced/discord/design"
import * as ReactNative from "react-native"

/** Five hearts for 0..100. */
export function hearts(love: number): string {
	const full = Math.round(Math.max(0, Math.min(100, love)) / 20)
	return `${"♥".repeat(full)}${"♡".repeat(5 - full)}`
}

/** Reputation, -100..100, as a word (thresholds as in Pet.kt `repTier`). */
export function standingWord(rep: number): string {
	return rep >= 60 ? "adores you" : rep >= 20 ? "likes you" : rep > -20 ? "neutral" : rep > -60 ? "grumpy" : "holds a grudge"
}

/** Reputation in words, with what it means for your buttons. */
function standing(rep: number): string {
	if (rep >= 60) return "Adores you: rarely takes anything, and gives it back on its own."
	if (rep >= 20) return "Likes you: takes things less often."
	if (rep > -20) return "Neutral: takes things now and then."
	if (rep > -60) return "Grumpy: takes things more often, and more of them."
	return "Holding a grudge: takes everything it can. Pets and treats win it back."
}

/** How it's doing: happiness right now, how it feels about you (opt-in grudges), and its stats. */
export default function Mood() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = Design as any

	const s = useSettings()
	const live = useNativeState()
	const bottom = useBottomPadding()
	const name = s.name?.trim() || PET.defaultName
	const love = live?.love ?? 80

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
				<Stack spacing={24}>
					<TableRowGroup title="Right now" hasIcons>
						<TableRow
							label="Happiness"
							subLabel={`${hearts(love)}  ${love < 30 ? "Lonely: pet it or give it a treat" : "Pets and treats keep it up. It drops slowly when you're away."}`}
							icon={rowIcon("EmojiSmilingFaceWithHeartsIcon", "ReactionIcon")}
						/>
					</TableRowGroup>

					<TableRowGroup
						title="Grudges"
						description={`${name} remembers how you treat it. Pets and treats raise it; tap-spamming, hard throws, shaking the phone and ignored treats lower it. It forgives slowly over time.`}
						hasIcons
					>
						<TableSwitchRow
							label="Holds grudges"
							subLabel={
								s.eat
									? "Off by default. Treated well, it takes fewer buttons and gives them back on its own. Treated badly, it takes more and more."
									: "Needs Fun → Eats buttons and icons."
							}
							icon={rowIcon("HeartIcon", "ReactionIcon")}
							disabled={!s.eat}
							value={s.grudges}
							onValueChange={(grudges: boolean) => update({ grudges })}
						/>
						{s.grudges && s.eat && live ? (
							<TableRow
								label="How it feels about you"
								subLabel={standing(live.rep ?? 0)}
								icon={rowIcon("EmojiSmilingFaceWithHeartsIcon", "ReactionIcon")}
							/>
						) : null}
					</TableRowGroup>

					{live ? (
						<TableRowGroup title="Stats" hasIcons>
							<TableRow label="Times petted" subLabel={`${live.pets}`} icon={rowIcon("HeartIcon", "ReactionIcon")} />
							<TableRow label="Treats eaten" subLabel={`${live.treatsEaten ?? 0}`} icon={rowIcon("GiftIcon", "ReactionIcon")} />
							<TableRow label="Things eaten" subLabel={`${live.eaten}`} icon={rowIcon("EmojiSmilingFaceWithHeartsIcon", "ReactionIcon")} />
						</TableRowGroup>
					) : null}
				</Stack>
			</ScrollView>
		</Page>
	)
}
