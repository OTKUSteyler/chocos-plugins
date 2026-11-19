import type { CapriStorage } from "../../native"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import { call, update, useSettings } from "../state"
import * as components from "@valenced/components"
import { Design } from "@valenced/discord/design"
import * as ReactNative from "react-native"

interface SpellOption {
	id: string
	label: string
	available: boolean
}

interface SpellGroup {
	title: string
	options: SpellOption[]
}

/** VFX publishes what its spells can show (lib/spells.ts there); missing when VFX isn't running. */
function spellGroups(): SpellGroup[] | null {
	const get = (globalThis as any).__bleelblepVfxSpells
	if (typeof get !== "function") return null
	try {
		return get() as SpellGroup[]
	} catch {
		return null
	}
}

type Rules = Pick<CapriStorage, "spellMode" | "spellList">

const isOn = (r: Rules, id: string) => (r.spellMode === "allow" ? r.spellList.includes(id) : !r.spellList.includes(id))

/**
 * Which things a spell may show. The list is stored the way the mode reads it: in "block" mode it
 * holds what is off, in "allow" mode what is on. Switching mode converts it, so the switches look
 * the same afterwards; the mode only decides what happens to things VFX adds later.
 */
export default function Spells() {
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow, TableRadioGroup, TableRadioRow } = Design as any

	const s = useSettings()
	const bottom = useBottomPadding()
	const groups = spellGroups()
	const all = groups?.flatMap(g => g.options.map(o => o.id)) ?? []
	const onCount = all.filter(id => isOn(s, id)).length

	const toggle = (id: string, on: boolean) => {
		const add = s.spellMode === "allow" ? on : !on
		const list = s.spellList.filter(x => x !== id)
		update({ spellList: add ? [...list, id] : list })
	}

	const setMode = (spellMode: Rules["spellMode"]) => {
		if (spellMode === s.spellMode) return
		const onNow = new Set(all.filter(id => isOn(s, id)))
		update({ spellMode, spellList: all.filter(id => (spellMode === "allow" ? onNow.has(id) : !onNow.has(id))) })
	}

	const setAll = (on: boolean) =>
		update({ spellList: (s.spellMode === "allow") === on ? all : [] })

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
				<Stack spacing={24}>
					{!groups ? (
						<View style={{ paddingHorizontal: 16 }}>
							<Text color="text-feedback-warning" variant="text-sm/medium">
								VFX isn't running, so there's nothing to choose from. Spells are shown by VFX: install
								or turn it on, then come back here.
							</Text>
						</View>
					) : null}

					<TableRadioGroup
						title="New things from VFX updates"
						defaultValue={s.spellMode}
						onChange={setMode}
					>
						<TableRadioRow
							label="Allowed until I turn them off"
							subLabel="Block list: everything can appear except what you switch off below."
							value="block"
						/>
						<TableRadioRow
							label="Off until I turn them on"
							subLabel="Allow list: only what you switch on below can appear."
							value="allow"
						/>
					</TableRadioGroup>

					{groups ? (
						<TableRowGroup
							description={
								onCount === 0
									? "Nothing is on, so spells only show the pose and sparkles, with no VFX effect."
									: `${onCount} of ${all.length} on.`
							}
							hasIcons
						>
							<TableRow
								label="Turn all on"
								icon={rowIcon("CircleCheckIcon", "CheckmarkLargeIcon")}
								disabled={onCount === all.length}
								onPress={() => setAll(true)}
							/>
							<TableRow
								label="Turn all off"
								icon={rowIcon("CircleXIcon", "CloseLargeIcon")}
								disabled={onCount === 0}
								onPress={() => setAll(false)}
							/>
							<TableRow
								label="Cast a spell now"
								subLabel="Plays one from what's on."
								icon={rowIcon("PlayIcon")}
								disabled={!s.show || onCount === 0}
								onPress={() => call("castMagic")}
							/>
						</TableRowGroup>
					) : null}

					{groups?.map(group => (
						<TableRowGroup key={group.title} title={group.title}>
							{group.options.map(option => (
								<TableSwitchRow
									key={option.id}
									label={option.label}
									subLabel={option.available ? undefined : "Not on this phone right now, so it's skipped either way."}
									value={isOn(s, option.id)}
									onValueChange={(on: boolean) => toggle(option.id, on)}
								/>
							))}
						</TableRowGroup>
					))}
				</Stack>
			</ScrollView>
		</Page>
	)
}
