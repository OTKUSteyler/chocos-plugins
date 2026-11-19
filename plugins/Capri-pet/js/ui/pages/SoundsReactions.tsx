import { MOODS } from "../../lib/moods"
import { PET } from "../../native"
import { rowIcon } from "../icon"
import { REACTIONS_ROUTE } from "../routes"
import { useBottomPadding } from "../safeArea"
import { update, useSettings } from "../state"
import { ReactNavigationNative } from "@valenced/externals/react-navigation"
import * as components from "@valenced/components"
import { Design } from "@valenced/discord/design"
import * as ReactNative from "react-native"

/** What it reacts to. */
export default function SoundsReactions() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = Design as any

	const { useNavigation } = ReactNavigationNative
	const navigation = useNavigation() as { navigate: (route: string) => void }
	const s = useSettings()
	const moodsOn = MOODS.filter(mood => !s.moodsOff.includes(mood.id)).length
	const bottom = useBottomPadding()
	const name = s.name?.trim() || PET.defaultName

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
				<Stack spacing={24}>
					<TableRowGroup title="Reacts to" hasIcons>
						<TableSwitchRow
							label="Discord"
							subLabel="Mentions, DMs, your sends, keywords in the channel you have open, opening a channel, and joining voice."
							icon={rowIcon("ChatIcon", "ic_message")}
							value={s.discord}
							onValueChange={(discord: boolean) => update({ discord })}
						/>
						<TableRow
							label="Message reactions"
							subLabel={s.discord ? `${moodsOn} of ${MOODS.length} on. Choose the keywords for each.` : "Turn on Discord first."}
							icon={rowIcon("FiltersHorizontalIcon", "SettingsIcon", "ic_settings")}
							arrow
							onPress={() => navigation.navigate(REACTIONS_ROUTE)}
						/>
						<TableSwitchRow
							label="Shaking the phone"
							subLabel={`Shake the phone and ${name} goes tumbling, then comes down dizzy. Uses the motion sensor only while ${name} is on screen.`}
							icon={rowIcon("MobilePhoneIcon", "PhoneIcon")}
							value={s.shake}
							onValueChange={(shake: boolean) => update({ shake })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
