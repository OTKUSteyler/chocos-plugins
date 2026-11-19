import { useChangelog } from "../../../../../shared/changelog"
import { PET, sizeLabel } from "../../native"
import { rowIcon } from "../icon"
import { FUN_ROUTE, MOOD_ROUTE, MOVEMENT_ROUTE, PET_ROUTE, SOUNDS_ROUTE } from "../routes"
import { standingWord } from "./Mood"
import { useBottomPadding } from "../safeArea"
import { call, update, useNativeState, useSettings } from "../state"
import { ReactNavigationNative } from "@valenced/externals/react-navigation"
import * as components from "@valenced/components"
import { Design } from "@valenced/discord/design"
import * as ReactNative from "react-native"


/** A word for 0..100 happiness. */
export function mood(love: number): string {
	return love < 30 ? "lonely" : love < 60 ? "okay" : love < 85 ? "happy" : "over the moon"
}

/**
 * Root index (docs/plugin-design-language.md §2.2): a neutral context card, one muted scope line,
 * the main controls in their own group, then the sub-pages.
 */
export default function Settings() {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, Card, TableRowGroup, TableRow, TableSwitchRow } = Design as any
	const { useNavigation } = ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	const s = useSettings()
	const live = useNativeState()
	const bottom = useBottomPadding()

	const pet = PET
	const name = s.name?.trim() || pet.defaultName
	const activity = s.wander ? ["calm", "normal", "lively", "hyper"][Math.min(3, Math.max(0, s.activity))] : "still"
	const reactsTo = [s.discord && "Discord", s.shake && "shakes"].filter(Boolean)
	const fun = [s.bubbles && "possession", s.treats && "treats", s.magic && "magic", s.eat && "eats buttons"].filter(Boolean)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
				<Stack spacing={24}>
					<Card variant="secondary" border="none">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-default" variant="text-md/semibold">
								A little pet that lives on your screen
							</Text>
							<Text color="text-muted" variant="text-sm/normal" style={{ marginTop: 8 }}>
								Tap to poke, double-tap to jump, hold to pet (swipe back and forth), drag to carry, flick to
								throw. If it ate something, tap it to get it back.
							</Text>
						</View>
					</Card>

					<Text color="text-muted" variant="text-sm/normal">
						It only lives on this phone. Nothing it does is sent to Discord or anyone else.
					</Text>

					<TableRowGroup hasIcons>
						<TableSwitchRow
							label={`Show ${name}`}
							subLabel={
								!s.show
									? `Hidden. It ${pet.leaves}.`
									: s.showWhen === 1
										? `${sizeLabel(s.sizeDp)}, while you type`
										: `${sizeLabel(s.sizeDp)}, on screen now`
							}
							icon={rowIcon("ReactionIcon", "StarIcon")}
							value={s.show}
							onValueChange={(show: boolean) => update({ show })}
						/>
						<TableRow
							label={`Call ${name} over`}
							subLabel={s.show ? "Brings it to the middle of the screen, wherever it went." : `Turn on Show ${name} first.`}
							icon={rowIcon("RefreshIcon", "ic_refresh")}
							disabled={!s.show}
							onPress={() => call("recenter")}
						/>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableRow
							label="Pet"
							subLabel={`${pet.label} called ${name}, ${sizeLabel(s.sizeDp).toLowerCase()}`}
							icon={rowIcon("EmojiSmilingFaceWithHeartsIcon", "ReactionIcon")}
							arrow
							onPress={() => navigation.navigate(PET_ROUTE)}
						/>
						<TableRow
							label="How it's doing"
							subLabel={
								live
									? [mood(live.love ?? 80), s.grudges && s.eat ? standingWord(live.rep ?? 0) : null, `petted ${live.pets} times`].filter(Boolean).join(", ")
									: "Happiness, grudges and stats"
							}
							icon={rowIcon("HeartIcon", "ReactionIcon")}
							arrow
							onPress={() => navigation.navigate(MOOD_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableRow
							label="Movement"
							subLabel={[activity, s.gravity ? "gravity" : "floats", s.showWhen === 1 ? "while typing" : "always there"].join(", ")}
							icon={rowIcon("CompassIcon", "LocationIcon")}
							arrow
							onPress={() => navigation.navigate(MOVEMENT_ROUTE)}
						/>
						<TableRow
							label="Reactions"
							subLabel={reactsTo.length ? `reacts to ${reactsTo.join(", ")}` : "reacts to nothing"}
							icon={rowIcon("SoundboardIcon", "MusicIcon")}
							arrow
							onPress={() => navigation.navigate(SOUNDS_ROUTE)}
						/>
						<TableRow
							label="Fun"
							subLabel={fun.length ? fun.join(", ") : "Nothing extra"}
							icon={rowIcon("StarIcon", "ReactionIcon")}
							arrow
							onPress={() => navigation.navigate(FUN_ROUTE)}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
