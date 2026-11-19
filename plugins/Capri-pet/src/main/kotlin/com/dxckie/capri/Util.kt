package com.dxckie.capri

import android.content.Context
import android.content.res.Resources
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.view.View

internal val mainHandler = Handler(Looper.getMainLooper())

/**
 * How often a "now and then" thing happens: 1 Rare, 2 Sometimes (the original timing), 3 Often,
 * 4 Very often. Off is the thing's own switch. Scales the waits, so randomness stays.
 */
internal fun rateScale(rate: Int): Float = when (rate) {
	1 -> 2.5f
	3 -> 0.4f
	4 -> 0.15f
	else -> 1f
}

internal fun validRate(v: Any?): Int? = (v as? Number)?.toInt()?.coerceIn(1, 4)

internal fun dp(value: Float): Float = value * Resources.getSystem().displayMetrics.density

internal fun clamp(value: Float, lo: Float, hi: Float): Float = if (hi < lo) lo else value.coerceIn(lo, hi)

/** The hidden `WindowManagerGlobal.mViews`: every window root in this process. */
private val mViewsField by lazy {
	runCatching {
		val cls = Class.forName("android.view.WindowManagerGlobal")
		val instance = cls.getMethod("getInstance").invoke(null)
		val field = cls.getDeclaredField("mViews").apply { isAccessible = true }
		instance to field
	}.getOrNull()
}

/** Every visible window root. Same approach as VFX and Focus Bubble. */
internal fun windowRoots(): List<View> {
	val (instance, field) = mViewsField ?: return emptyList()
	val views = runCatching { (field.get(instance) as List<*>).toList() }.getOrNull() ?: return emptyList()
	return views.filterIsInstance<View>().filter { it.isAttachedToWindow && it.width > 0 }
}

/**
 * The colours of the active Discord theme (Ash, Dark, Onyx, Light), read from Discord's own
 * `ThemeManager` by reflection, as AI Core does; any miss falls back to the dark palette.
 */
internal class Palette(val surface: Int, val text: Int, val border: Int)

internal fun discordPalette(context: Context): Palette {
	val theme = runCatching {
		val manager = Class.forName("com.discord.theme.ThemeManager", true, context.classLoader)
		manager.getMethod("getEffectiveTheme").invoke(manager.getField("INSTANCE").get(null))
	}.getOrNull()
	// Discord 352.2+ (R8-minified): no ThemeManager by name, so colours come from resources.
	val minified = if (theme == null) MinifiedTheme.current() else null
	fun color(getter: String, fallback: Long, vararg resources: String): Int =
		runCatching { theme!!.javaClass.getMethod(getter).invoke(theme) as Int }.getOrNull()
			?: minified?.let { MinifiedTheme.color(context, it, *resources) }
			?: fallback.toInt()
	return Palette(
		surface = color("getBackgroundSurfaceHigh", 0xFF2B2D31, "neutral_64", "neutral_79", "neutral_1", "neutral_96"),
		text = color("getTextDefault", 0xFFDBDEE1, "neutral_4", "neutral_5", "neutral_72", "neutral_12"),
		border = color(
			"getInputBorderDefault", 0x33FFFFFF, "input_border_default_ash", "input_border_default_dark",
			"input_border_default_light", "input_border_default_onyx",
		),
	)
}

private var ggSansBold: Typeface? = null
private var ggSansLoaded = false

/** gg sans from Discord's own assets; null (system font) if a build ever drops the file. */
internal fun ggSans(context: Context): Typeface? {
	if (!ggSansLoaded) {
		ggSansLoaded = true
		ggSansBold = runCatching { Typeface.createFromAsset(context.assets, "fonts/ggsans-Semibold.ttf") }.getOrNull()
	}
	return ggSansBold
}
