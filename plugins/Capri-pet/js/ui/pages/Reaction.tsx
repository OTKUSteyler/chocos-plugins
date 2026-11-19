import { fxOn, keyOf, moodById, ownerOf, removedOf, withWord, withoutWord, wordsOf } from "../../lib/moods"
import { callNative, PET } from "../../native"
import { FieldRow } from "../fieldGroup"
import { rowIcon } from "../icon"
import { getViewingMood } from "../routes"
import { useBottomPadding } from "../safeArea"
import { toast, update, useSettings } from "../state"
import { ReactNavigationNative } from "@valenced/externals/react-navigation"
import * as components from "@valenced/components"
import { Design } from "@valenced/discord/design"
import * as React from "react"
import * as ReactNative from "react-native"
import { reportError } from "../../../../../shared/report"

/**
 * One message reaction: on or off, try it, and its keywords. Built-in keywords can be removed and
 * brought back; the user's own can be added. A keyword another reaction has moves here.
 */
export default function Reaction() {
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow, TextInput } = Design as any
	const { useNavigation, useRoute } = ReactNavigationNative as any
	const navigation = useNavigation() as any
	const route = useRoute?.() as { params?: { id?: string } } | undefined
	const id = route?.params?.id ?? getViewingMood()
	const mood = moodById(id)

	const s = useSettings()
	const bottom = useBottomPadding()
	const [draft, setDraft] = React.useState("")

	React.useEffect(() => {
		if (mood) navigation?.setOptions?.({ title: mood.label })
	}, [mood?.id])

	if (!mood) return null

	const name = s.name?.trim() || PET.defaultName
	const on = !s.moodsOff.includes(mood.id)
	const words = wordsOf(s, mood.id)
	const removed = removedOf(s, mood.id)
	const typed = draft.trim()
	const owner = typed ? ownerOf(s, typed) : undefined
	const ownerLabel = owner && owner !== mood.id ? moodById(owner)?.label : undefined

	const add = () => {
		if (!typed) return
		const change = withWord(s, mood.id, typed)
		if (Object.keys(change).length) update(change)
		if (ownerLabel) toast(`Moved “${typed}” from ${ownerLabel}`)
		setDraft("")
	}

	const tryIt = () => {
		if (!s.show || !s.discord) {
			toast(!s.show ? `${name} isn't on screen` : "Reacting to Discord is off")
			return
		}
		const sample = words[0]?.word
		callNative("react", [mood.id, sample ?? null, fxOn(s, mood.id), true]).catch(error => {
			reportError("[Capri] react failed:", error)
			toast("Capri-Pet didn't respond. Is it switched on?")
		})
	}

	return (
		<Page>
			<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: bottom }}>
				<Stack spacing={24}>
					<TableRowGroup hasIcons>
						<TableSwitchRow
							label={`React to ${mood.label.toLowerCase()}`}
							subLabel={mood.does}
							icon={rowIcon("ChatIcon", "ic_message")}
							value={on}
							onValueChange={(value: boolean) =>
								update({ moodsOff: value ? s.moodsOff.filter(x => x !== mood.id) : [...s.moodsOff, mood.id] })
							}
						/>
						<TableSwitchRow
							label="Full-screen effect"
							subLabel={s.moodEffects ? mood.fx : `${mood.fx}. Turn on Full-screen effects on the previous page first.`}
							icon={rowIcon("StarIcon", "ic_star")}
							disabled={!on || !s.moodEffects}
							value={fxOn(s, mood.id)}
							onValueChange={(value: boolean) =>
								update({ moodFxOff: value ? s.moodFxOff.filter(x => x !== mood.id) : [...s.moodFxOff, mood.id] })
							}
						/>
						<TableRow
							label="Try it"
							subLabel={`${name} reacts now, if it's free to.`}
							icon={rowIcon("PlayIcon")}
							disabled={!on}
							onPress={tryIt}
						/>
					</TableRowGroup>


					<TableRowGroup hasIcons>
						<FieldRow
							label="Add a keyword"
							description="A word, a phrase or an emoji. Not case-sensitive, and stretched spellings count: “hi” also catches “hiii”."
						>
							<TextInput placeholder="keyword" value={draft} returnKeyType="done" isClearable onChange={setDraft} />
						</FieldRow>
						<TableRow
							label="Add to this reaction"
							subLabel={
								!typed
									? "Type a keyword above first"
									: owner === mood.id
										? `“${typed}” is already here`
										: ownerLabel
											? `Moves “${typed}” here from ${ownerLabel}`
											: `Messages with “${typed}” make ${name} react like this`
							}
							icon={rowIcon("PlusSmallIcon", "PlusLargeIcon", "ic_add_24px")}
							disabled={!typed || owner === mood.id}
							onPress={add}
						/>
					</TableRowGroup>

					{words.length ? (
						<TableRowGroup title={`${words.length} keyword${words.length === 1 ? "" : "s"}, tap one to remove it`}>
							{words.map(entry => (
								<TableRow
									key={keyOf(entry.word)}
									label={entry.word}
									subLabel={entry.builtIn ? undefined : "Added by you"}
									onPress={() => update(withoutWord(s, mood.id, entry.word))}
								/>
							))}
						</TableRowGroup>
					) : (
						<View style={{ paddingHorizontal: 16 }}>
							<Text variant="text-sm/normal" color="text-muted">
								No keywords, so this reaction never plays. Add one above.
							</Text>
						</View>
					)}

					{removed.length ? (
						<TableRowGroup title="Removed, tap one to bring it back">
							{removed.map(word => {
								const elsewhere = ownerOf(s, word)
								const label = elsewhere ? moodById(elsewhere)?.label : undefined
								return (
									<TableRow
										key={keyOf(word)}
										label={word}
										subLabel={label ? `Now in ${label}; bringing it back moves it here` : undefined}
										onPress={() => update(withWord(s, mood.id, word))}
									/>
								)
							})}
						</TableRowGroup>
					) : null}
				</Stack>
			</ScrollView>
		</Page>
	)
}
