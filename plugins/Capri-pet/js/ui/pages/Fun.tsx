import { PET } from "../../native"
import { rowIcon } from "../icon"
import { RateSlider } from "../rateSlider"
import { useBottomPadding } from "../safeArea"
import { call, update, useSettings } from "../state"
import * as components from "@valenced/components"
import { Design } from "@valenced/discord/design"
import * as ReactNative from "react-native"

/** The extras: possession, star strike, treats, eating buttons, and buttons to try them. */
export default function Fun() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableRow, TableRadioGroup, TableRadioRow } = Design as any

	const s = useSettings()
	const bottom = useBottomPadding()
	const name = s.name?.trim() || PET.defaultName
	const needsShow = s.show ? "" : ` Turn on Show ${name} first.`
	const bubbleChoice = !s.bubbles ? "off" : s.bubbleFx ? "fx" : "plain"

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
				<Stack spacing={24}>
					<RateSlider
						title="Treats"
						description={`A treat (fish, milk, a drumstick) turns up: with Gravity on it drops to the floor, off it floats. Tap it and ${name} goes to eat it, which makes it very happy. Twice as often when it's lonely.`}
						on={s.treats}
						rate={s.treatRate}
						minSeconds={240}
						maxSeconds={540}
						onChange={(treats, treatRate) => update({ treats, treatRate })}
					/>

					<RateSlider
						title="Eats buttons and icons"
						description={`It gobbles a small button near it. Tap ${name} and it gives everything back. Nothing changes for real: the button only hides.`}
						on={s.eat}
						rate={s.eatRate}
						minSeconds={40}
						maxSeconds={120}
						onChange={(eat, eatRate) => update({ eat, eatRate })}
					/>
					<TableRowGroup hasIcons>
						<TableRow
							label="Give everything back"
							subLabel="Puts back anything it has eaten, straight away."
							icon={rowIcon("RefreshIcon", "ic_refresh")}
							onPress={() => call("giveBack")}
						/>
					</TableRowGroup>

					<TableRadioGroup
						key={`bubbles-${bubbleChoice}`}
						title="Possession"
						description="Now and then, and when she's happy, she dives into the screen: red lightning runs round its edge and eyes open all over it, watching her. With the screen glitch, bars of red, purple and green tear across it too."
						defaultValue={bubbleChoice}
						onChange={(value: string) => update({ bubbles: value !== "off", bubbleFx: value === "fx" })}
					>
						<TableRadioRow label="Off" value="off" />
						<TableRadioRow label="Possession" value="plain" />
						<TableRadioRow label="Possession and screen glitch" subLabel="Works on any Android. Works alongside VFX." value="fx" />
					</TableRadioGroup>

					<RateSlider
						title="Star strike"
						description="Now and then she calls down a star: a faint constellation, a trail of sparkles, then a lightning strike that bursts it."
						on={s.magic}
						rate={s.magicRate}
						minSeconds={60}
						maxSeconds={180}
						onChange={(magic, magicRate) => update({ magic, magicRate })}
					/>

					<TableRowGroup title="Try it" hasIcons>
						<TableRow
							label="Possess the screen now"
							subLabel={`See it without waiting.${needsShow}`}
							icon={rowIcon("PlayIcon")}
							disabled={!s.show}
							onPress={() => call("blow")}
						/>
						<TableRow
							label="Call the star now"
							subLabel={`See it without waiting.${needsShow}`}
							icon={rowIcon("PlayIcon")}
							disabled={!s.show}
							onPress={() => call("castMagic")}
						/>
						<TableRow
							label="Drop a treat now"
							subLabel={s.show ? `Tap it and ${name} comes to eat it.` : needsShow.trim()}
							icon={rowIcon("PlayIcon")}
							disabled={!s.show}
							onPress={() => call("dropTreat")}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
