import { MOODS, fxOn, wordsOf } from "../../lib/moods"
import { PET } from "../../native"
import { rowIcon } from "../icon"
import { REACTION_ROUTE, setViewingMood } from "../routes"
import { useBottomPadding } from "../safeArea"
import { update, useSettings } from "../state"
import { ReactNavigationNative } from "@valenced/externals/react-navigation"
import * as components from "@valenced/components"
import { Design } from "@valenced/discord/design"
import * as ReactNative from "react-native"

/** Message reactions: every reaction, on or off, with how many keywords set it off. */
export default function Reactions() {
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow } = Design as any
	const { useNavigation } = ReactNavigationNative as any
	const navigation = useNavigation() as { navigate: (route: string, params?: object) => void }

	const s = useSettings()
	const bottom = useBottomPadding()
	const name = s.name?.trim() || PET.defaultName
	const off = new Set(s.moodsOff)
	const onCount = MOODS.filter(mood => !off.has(mood.id)).length
	const edited = s.moodFxOff.length > 0 || MOODS.some(mood => s.moodAdded[mood.id]?.length || s.moodRemoved[mood.id]?.length)

	const open = (id: string) => {
		setViewingMood(id)
		navigation.navigate(REACTION_ROUTE, { id })
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
				<Stack spacing={24}>
					<View style={{ paddingHorizontal: 16 }}>
						<Text variant="text-sm/normal" color="text-muted">
							{`When a message in the channel you have open, or a DM, has one of a reaction's keywords, ${name} reacts. The first match in this list wins. Tap a reaction to change its keywords.`}
						</Text>
					</View>
					{!s.discord ? (
						<View style={{ paddingHorizontal: 16 }}>
							<Text variant="text-sm/medium" color="text-feedback-warning">
								Reacting to Discord is off, so none of these play. Turn it on in Reactions.
							</Text>
						</View>
					) : null}

					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Full-screen effects"
							subLabel={
								`Each reaction also fills the screen with its own effect for a few seconds: hearts for Love, confetti for Celebrate, rain for Sad and more. ${name} stays on top and you can keep tapping through it. At most one every 6 seconds.`
							}
							icon={rowIcon("StarIcon", "ic_star")}
							value={s.moodEffects}
							onValueChange={(moodEffects: boolean) => update({ moodEffects })}
						/>
					</TableRowGroup>

					<TableRowGroup title={`${onCount} of ${MOODS.length} on`}>
						{MOODS.map(mood => {
							const words = wordsOf(s, mood.id)
							const sample = words.slice(0, 5).map(entry => entry.word).join("  ")
							const effect = !off.has(mood.id) && fxOn(s, mood.id)
							return (
								<TableRow
									key={mood.id}
									label={mood.label}
									subLabel={
										off.has(mood.id)
											? "Off"
											: (words.length
													? `${sample}${words.length > 5 ? `  +${words.length - 5}` : ""}`
													: "No keywords, so it never plays") + (effect ? "  ·  with effect" : "")
									}
									arrow
									onPress={() => open(mood.id)}
								/>
							)
						})}
					</TableRowGroup>

					{edited || off.size ? (
						<TableRowGroup>
							<TableRow
								label="Reset all reactions"
								subLabel="Turns every reaction on and puts back the built-in keywords and effects. Your own keywords are removed."
								onPress={() => update({ moodsOff: [], moodAdded: {}, moodRemoved: {}, moodFxOff: [] })}
							/>
						</TableRowGroup>
					) : null}
				</Stack>
			</ScrollView>
		</Page>
	)
}
