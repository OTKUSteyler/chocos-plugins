import Fun from "./pages/Fun"
import Mood from "./pages/Mood"
import Movement from "./pages/Movement"
import Pet from "./pages/Pet"
import Reaction from "./pages/Reaction"
import Reactions from "./pages/Reactions"
import SoundsReactions from "./pages/SoundsReactions"
import Spells from "./pages/Spells"
import * as modulesSettings from "@valenced/discord/modules/settings"

const PREFIX = "com.otkusteyler.capri-pet"

export const PET_ROUTE = `${PREFIX}.pet`
export const MOOD_ROUTE = `${PREFIX}.mood`
export const MOVEMENT_ROUTE = `${PREFIX}.movement`
export const SOUNDS_ROUTE = `${PREFIX}.sounds`
export const FUN_ROUTE = `${PREFIX}.fun`
export const SPELLS_ROUTE = `${PREFIX}.spells`
export const REACTIONS_ROUTE = `${PREFIX}.reactions`
export const REACTION_ROUTE = `${PREFIX}.reaction`

/** Which reaction the Reaction page shows: route params when they arrive, this when they don't. */
let viewingMood = "love"
export const setViewingMood = (id: string) => {
	viewingMood = id
}
export const getViewingMood = () => viewingMood

const PAGES: [route: string, title: string, component: () => any][] = [
	[PET_ROUTE, "Pet", Pet],
	[MOOD_ROUTE, "How it's doing", Mood],
	[MOVEMENT_ROUTE, "Movement", Movement],
	[SOUNDS_ROUTE, "Reactions", SoundsReactions],
	[FUN_ROUTE, "Fun", Fun],
	[SPELLS_ROUTE, "Spells", Spells],
	[REACTIONS_ROUTE, "Message reactions", Reactions],
	[REACTION_ROUTE, "Reaction", Reaction],
]

function refreshSettingsUI() {
	const settings = modulesSettings as any
	if (typeof settings.refreshSettings === "function") {
		settings.refreshSettings()
		return
	}
	settings.refreshSettingsNavigator?.()
	settings.refreshSettingsOverviewScreen?.()
}

/** Same registration as ghost-log-native-beta's ui/routes.tsx. */
export function registerPages(): () => void {
	const { registerSettingsItem, onSettingsModulesLoaded } = modulesSettings

	let unregister: Array<() => void> = []
	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = PAGES.map(([route, title, component]) =>
			registerSettingsItem(route, {
				parent: null,
				type: "route",
				useTitle: () => title,
				screen: { route, getComponent: () => component },
			}),
		)
		refreshSettingsUI()
	})

	return () => {
		unsubscribe()
		for (const remove of unregister) remove()
		unregister = []
		refreshSettingsUI()
	}
}
