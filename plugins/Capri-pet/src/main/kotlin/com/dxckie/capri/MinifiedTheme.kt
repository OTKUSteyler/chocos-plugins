package com.dxckie.capri

import android.content.Context
import app.valenced.xposed.api.DexFinder
import java.lang.reflect.Modifier

/**
 * Discord's theme colours on R8-minified Discord (352.2+), where `ThemeManager` is renamed, the four
 * theme classes are merged into one and most colour getters are inlined away.
 *
 * Two things survive: the theme's name (ASH / DARK / LIGHT / ONYX, an enum held in a static field
 * of the class whose lateinit check names "resourceTheme") and the colour resources each theme was
 * built from. So a colour is read by its resource name for the current theme. Discord's saturation
 * setting isn't applied.
 */
internal object MinifiedTheme {
	/** Set at start; null on hosts older than 1.9.1, which can't find minified classes. */
	@Volatile var finder: DexFinder? = null

	private val THEMES = listOf("ASH", "DARK", "LIGHT", "ONYX")

	/** The current theme's name, or null when it can't be found (or Discord isn't minified). */
	fun current(): String? = runCatching {
		val manager = finder?.findClass { matcher { usingEqStrings("resourceTheme") } } ?: return null
		// Two static fields hold the theme enum: the theme, and a short-lived override.
		manager.declaredFields
			.filter { Modifier.isStatic(it.modifiers) && it.type.isEnum }
			.mapNotNull { it.apply { isAccessible = true }.get(null) as? Enum<*> }
			.map { it.name }
			.firstOrNull { it in THEMES }
	}.getOrNull()

	/**
	 * The colour of resource [names] (one per theme, in Ash, Dark, Light, Onyx order, or a single name
	 * for all four) for [theme], or null when the resource isn't there.
	 */
	fun color(context: Context, theme: String, vararg names: String): Int? = runCatching {
		val name = if (names.size == 1) names[0] else names[THEMES.indexOf(theme)]
		val res = context.resources
		val id = res.getIdentifier(name, "color", context.packageName)
		if (id == 0) null else res.getColor(id, context.theme)
	}.getOrNull()
}
