@file:JvmName("CapriPlugin")

package com.dxckie.capri

import app.valenced.plugins.plugin
import app.valenced.xposed.api.callJSMethod
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import app.valenced.xposed.api.registerNativeMethod
import org.json.JSONObject
import java.io.File

/**
 * Native owns the settings, as in VFX: Sparkle needs them before JS has loaded, so they live in
 * settings.json here and JS keeps a mirror for its pages.
 */
internal object Settings {
	@Volatile var show = true
	/** 0 small, 1 medium, 2 large: the nearest stop to [sizeDp], kept for Quick Toggles and old saves. */
	@Volatile var size = 1
	/** How big, in dp (SIZE_MIN_DP..SIZE_MAX_DP); the settings slider, which snaps to the three stops. */
	@Volatile var sizeDp = 64
	@Volatile var gravity = false
	@Volatile var wander = true
	@Volatile var talks = true
	/** Index into Pet's SLEEP_SECONDS: 1, 3, 10 minutes, never. */
	@Volatile var sleepAfter = 1
	@Volatile var eat = true
	@Volatile var shake = true
	@Volatile var discord = true
	@Volatile var haptics = true
	/** Blows bubbles now and then, and when happy. */
	@Volatile var bubbles = true
	/** Android 13+: while bubbles are out, a swirling soap-film screen, and pops that ripple it. */
	@Volatile var bubbleFx = true
	/** 0: always on screen. 1: only while the keyboard is up (typing), leaving a few seconds after. */
	@Volatile var showWhen = 0
	/** Now and then a treat drops in; tap it to feed it. */
	@Volatile var treats = true
	/** What it calls itself. */
	@Volatile var name = "Capri"
	/** 0 no outline, 1 automatic (contrasts with the theme), 2 light, 3 dark. */
	@Volatile var outline = 1
	/** Now and then casts a spell: VFX shows a random filter or effect for a few seconds. */
	@Volatile var magic = false
	/** How often each "now and then" thing happens; see [rateScale]. 2 is the original timing. */
	@Volatile var magicRate = 2
	/** How lively it is between touches: 0 Calm (the old behaviour), 1 Normal, 2 Lively, 3 Hyper. */
	@Volatile var activity = 1
	@Volatile var treatRate = 2
	@Volatile var partyRate = 2
	@Volatile var eatRate = 2

	/** Where it was last left, as a fraction of the room it can move in (0..1000). */
	@Volatile var posX = 800
	@Volatile var posY = 720
	@Volatile var pets = 0
	@Volatile var eaten = 0
	@Volatile var treatsEaten = 0
	/** Happiness, 0..100: attention and treats fill it, time drains it (see Pet.love). */
	@Volatile var love = 80
	/** Wall-clock ms when [love] was last brought up to date. */
	@Volatile var loveAt = 0L
	/** Opt-in: how it treats your buttons follows how you treat it (Pet.reputation). Off by default. */
	@Volatile var grudges = false
	/** Reputation, -100..100. Pets and treats raise it; tap-spam, hard throws, shaking and ignored treats lower it. */
	@Volatile var rep = 0
	/** Wall-clock ms when [rep] last drifted back toward 0. */
	@Volatile var repAt = 0L
}

/** JS registered `bleelblep.sparkle.magic` and is running; set through the `magicReady` native method. */
@Volatile private var jsMagicReady = false

internal fun cleanName(raw: String?): String = raw?.trim()?.take(24)?.ifEmpty { null } ?: "Sparkle"

private const val SETTINGS_FILE = "settings.json"

private fun settingsMap() = mapOf(
	"show" to Settings.show,
	"size" to Settings.size,
	"sizeDp" to Settings.sizeDp,
	"gravity" to Settings.gravity,
	"wander" to Settings.wander,
	"talks" to Settings.talks,
	"sleepAfter" to Settings.sleepAfter,
	"eat" to Settings.eat,
	"shake" to Settings.shake,
	"discord" to Settings.discord,
	"haptics" to Settings.haptics,
	"bubbles" to Settings.bubbles,
	"bubbleFx" to Settings.bubbleFx,
	"magic" to Settings.magic,
	"magicRate" to Settings.magicRate,
	"activity" to Settings.activity,
	"treatRate" to Settings.treatRate,
	"partyRate" to Settings.partyRate,
	"eatRate" to Settings.eatRate,
	"showWhen" to Settings.showWhen,
	"treats" to Settings.treats,
	"name" to Settings.name,
	"outline" to Settings.outline,
	"treatsEaten" to Settings.treatsEaten,
	"love" to Pet.love(),
	"grudges" to Settings.grudges,
	"rep" to Pet.reputation(),
	"pets" to Settings.pets,
	"eaten" to Settings.eaten,
	"state" to Pet.state.name.lowercase(),
)

/** The settings page's pet animations, by request; the oldest go first. A few MB at most. */
private val previewCache = object : LinkedHashMap<String, Map<String, Any?>>(32, 0.75f, true) {
	override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Map<String, Any?>>?) = size > 64
}

/**
 * A frame as a PNG data URI for the settings page, scaled up with hard edges. With [targetPx] (the
 * size the page will show it at, in screen pixels) it's the biggest whole-number scale that fits, so
 * the page can show it pixel for pixel; resizing it there smoothed the pixel art into a blur.
 */
private fun dataUri(frame: android.graphics.Bitmap, targetPx: Int = 0, scale: Int = 0): String {
	val scale = if (scale > 0) scale else if (targetPx > 0) maxOf(1, targetPx / maxOf(frame.width, frame.height))
		else maxOf(1, 240 / maxOf(frame.width, frame.height / 2))
	val big = android.graphics.Bitmap.createScaledBitmap(frame, frame.width * scale, frame.height * scale, false)
	val out = java.io.ByteArrayOutputStream()
	big.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, out)
	return "data:image/png;base64," + android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP)
}

val sparklePlugin = plugin {
	start {
		MinifiedTheme.finder = runCatching { dexFinder }.getOrNull()
		val file = File(storageDir, SETTINGS_FILE)
		if (file.exists()) {
			runCatching {
				val json = JSONObject(file.readText())
				Settings.show = json.optBoolean("show", true)
				Settings.size = json.optInt("size", 1).coerceIn(0, 2)
				Settings.sizeDp = json.optInt("sizeDp", SIZE_DP[Settings.size].toInt()).coerceIn(SIZE_MIN_DP, SIZE_MAX_DP)
				Settings.gravity = json.optBoolean("gravity", false)
				Settings.wander = json.optBoolean("wander", true)
				Settings.talks = json.optBoolean("talks", true)
				Settings.sleepAfter = json.optInt("sleepAfter", 1).coerceIn(0, 4)
				Settings.eat = json.optBoolean("eat", true)
				Settings.shake = json.optBoolean("shake", true)
				Settings.discord = json.optBoolean("discord", true)
				Settings.haptics = json.optBoolean("haptics", true)
				Settings.bubbles = json.optBoolean("bubbles", true)
				Settings.bubbleFx = json.optBoolean("bubbleFx", true)
				Settings.magic = json.optBoolean("magic", false)
				Settings.magicRate = validRate(json.optInt("magicRate", 2)) ?: 2
				Settings.activity = json.optInt("activity", 1).coerceIn(0, 3)
				Settings.treatRate = validRate(json.optInt("treatRate", 2)) ?: 2
				Settings.partyRate = validRate(json.optInt("partyRate", 2)) ?: 2
				Settings.eatRate = validRate(json.optInt("eatRate", 2)) ?: 2
				Settings.posX = json.optInt("posX", 800).coerceIn(0, 1000)
				Settings.posY = json.optInt("posY", 720).coerceIn(0, 1000)
				Settings.pets = json.optInt("pets", 0).coerceAtLeast(0)
				Settings.eaten = json.optInt("eaten", 0).coerceAtLeast(0)
				Settings.showWhen = json.optInt("showWhen", 0).coerceIn(0, 1)
				Settings.treats = json.optBoolean("treats", true)
				Settings.name = cleanName(json.optString("name", "Capri"))
				Settings.outline = json.optInt("outline", 1).coerceIn(0, 3)
				Settings.treatsEaten = json.optInt("treatsEaten", 0).coerceAtLeast(0)
				Settings.love = json.optInt("love", 80).coerceIn(0, 100)
				Settings.loveAt = json.optLong("loveAt", 0L)
				Settings.grudges = json.optBoolean("grudges", false)
				Settings.rep = json.optInt("rep", 0).coerceIn(-100, 100)
				Settings.repAt = json.optLong("repAt", 0L)
			}.onFailure { log.w("could not read settings: ${it.message}") }
		}

		fun save() = runCatching {
			file.writeText(
				JSONObject()
					.put("show", Settings.show)
					.put("size", Settings.size)
					.put("sizeDp", Settings.sizeDp)
					.put("gravity", Settings.gravity)
					.put("wander", Settings.wander)
					.put("talks", Settings.talks)
					.put("sleepAfter", Settings.sleepAfter)
					.put("eat", Settings.eat)
					.put("shake", Settings.shake)
					.put("discord", Settings.discord)
					.put("haptics", Settings.haptics)
					.put("bubbles", Settings.bubbles)
					.put("bubbleFx", Settings.bubbleFx)
					.put("magic", Settings.magic)
					.put("magicRate", Settings.magicRate)
					.put("activity", Settings.activity)
					.put("treatRate", Settings.treatRate)
					.put("partyRate", Settings.partyRate)
					.put("eatRate", Settings.eatRate)
					.put("posX", Settings.posX)
					.put("posY", Settings.posY)
					.put("pets", Settings.pets)
					.put("eaten", Settings.eaten)
					.put("showWhen", Settings.showWhen)
					.put("treats", Settings.treats)
					.put("name", Settings.name)
					.put("outline", Settings.outline)
					.put("treatsEaten", Settings.treatsEaten)
					.put("love", Settings.love)
					.put("loveAt", Settings.loveAt)
					.put("grudges", Settings.grudges)
					.put("rep", Settings.rep)
					.put("repAt", Settings.repAt)
					.toString(),
			)
		}.onFailure { log.w("could not save settings: ${it.message}") }

		// Position and stats change often (every landing); coalesce them into one write a second.
		val persist = Runnable { save() }
		Pet.onPersist = {
			mainHandler.removeCallbacks(persist)
			mainHandler.postDelayed(persist, 1000)
		}

		// A spell is cast in native (the pose, sparkles, a line) and shown by VFX, which only JS can
		// reach: its methods are another plugin's. JS answers `magic` by asking VFX for a surprise.
		val host = this
		val jsScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
		Pet.onMagic = {
			// Only once JS has registered `magic`: calling a JS method that isn't there throws on the JS
			// side (Revenge's error dialog), which runCatching here can't catch.
			if (!jsMagicReady) log.w("magic: JS isn't ready, VFX skipped")
			else jsScope.launch {
				runCatching { host.callJSMethod("${manifest.id}.magic") }
					.onFailure { log.w("magic failed: ${it.message}") }
			}
		}
		mainHandler.post { runCatching { Pet.start(sayHello = true) }.onFailure { log.e("start failed: ${it.message}") } }

		registerNativeMethod("${manifest.id}.magicReady") { args ->
			jsMagicReady = args.firstOrNull() as? Boolean ?: false
			true
		}
		registerNativeMethod("${manifest.id}.getSettings") { _ -> settingsMap() }
		registerNativeMethod("${manifest.id}.setSettings") { args ->
			val patch = args.firstOrNull() as? Map<*, *> ?: emptyMap<Any, Any>()
			val showBefore = Settings.show
			val sizeBefore = Settings.sizeDp
			(patch["show"] as? Boolean)?.let { Settings.show = it }
			(patch["size"] as? Number)?.let {
				// The old three-way size (Quick Toggles still sends it): jump to that stop.
				Settings.size = it.toInt().coerceIn(0, 2)
				Settings.sizeDp = SIZE_DP[Settings.size].toInt()
			}
			(patch["sizeDp"] as? Number)?.let {
				Settings.sizeDp = it.toInt().coerceIn(SIZE_MIN_DP, SIZE_MAX_DP)
				Settings.size = SIZE_DP.indices.minByOrNull { i -> kotlin.math.abs(SIZE_DP[i] - Settings.sizeDp) } ?: 1
			}
			(patch["gravity"] as? Boolean)?.let { Settings.gravity = it }
			(patch["wander"] as? Boolean)?.let { Settings.wander = it }
			(patch["talks"] as? Boolean)?.let { Settings.talks = it }
			(patch["sleepAfter"] as? Number)?.let { Settings.sleepAfter = it.toInt().coerceIn(0, 4) }
			(patch["eat"] as? Boolean)?.let { Settings.eat = it }
			(patch["shake"] as? Boolean)?.let { Settings.shake = it }
			(patch["discord"] as? Boolean)?.let { Settings.discord = it }
			(patch["haptics"] as? Boolean)?.let { Settings.haptics = it }
			(patch["bubbles"] as? Boolean)?.let { Settings.bubbles = it }
			(patch["bubbleFx"] as? Boolean)?.let { Settings.bubbleFx = it }
			(patch["magic"] as? Boolean)?.let { Settings.magic = it }
			val ratesBefore = listOf(Settings.magicRate, Settings.treatRate, Settings.partyRate, Settings.eatRate)
			validRate(patch["magicRate"])?.let { Settings.magicRate = it }
			(patch["activity"] as? Number)?.let { Settings.activity = it.toInt().coerceIn(0, 3) }
			validRate(patch["treatRate"])?.let { Settings.treatRate = it }
			validRate(patch["partyRate"])?.let { Settings.partyRate = it }
			validRate(patch["eatRate"])?.let { Settings.eatRate = it }
			val ratesChanged = ratesBefore != listOf(Settings.magicRate, Settings.treatRate, Settings.partyRate, Settings.eatRate)
			(patch["showWhen"] as? Number)?.let { Settings.showWhen = it.toInt().coerceIn(0, 1) }
			(patch["treats"] as? Boolean)?.let { Settings.treats = it }
			(patch["name"] as? String)?.let { Settings.name = cleanName(it) }
			(patch["outline"] as? Number)?.let { Settings.outline = it.toInt().coerceIn(0, 3) }
			(patch["grudges"] as? Boolean)?.let { Settings.grudges = it }
			save()
			mainHandler.post {
				runCatching {
					if (Settings.show != showBefore) {
						if (Settings.show) Pet.start(sayHello = true) else Pet.leave()
					}
					if (Settings.sizeDp != sizeBefore) Pet.resize()
					if (!Settings.eat) Eater.restoreAll()
					if (!Settings.treats) Pet.clearTreat()
					// A new rate starts a fresh wait, so going from Rare to Very often doesn't sit out the old one.
					if (ratesChanged) Pet.rescheduleTimers()
					Phone.sync()
				}.onFailure { log.e("applying settings failed: ${it.message}") }
			}
			settingsMap()
		}
		// A Discord event from JS: (kind, name?, fx?, force?). fx plays its full-screen effect; force skips the gap (Try it). See js/lib/reactions.ts for the kinds.
		registerNativeMethod("${manifest.id}.react") { args ->
			val kind = args.getOrNull(0) as? String ?: return@registerNativeMethod false
			val name = args.getOrNull(1) as? String
			val fx = args.getOrNull(2) as? Boolean ?: false
			val force = args.getOrNull(3) as? Boolean ?: false
			mainHandler.post { runCatching { Pet.react(kind, name, fx, force) } }
			true
		}
		registerNativeMethod("${manifest.id}.recenter") { _ ->
			mainHandler.post { runCatching { Pet.recenter() } }
			save()
			true
		}
		// The pose tester: an animation as one grid image, its frame rate and size.
		registerNativeMethod("${manifest.id}.previewFrames") { args ->
			// Drawing and encoding a pet's frames takes a second or so; the same request again (back to a
			// pet, reopening the page) is answered from here.
			val cacheKey = args.joinToString("|")
			synchronized(previewCache) { previewCache[cacheKey] }?.let { return@registerNativeMethod it }
			val look = Looks.current
			val name = args.getOrNull(0) as? String ?: "IDLE"
			val anim = Anim.entries.firstOrNull { it.name == name } ?: return@registerNativeMethod false
			val still = ((args.getOrNull(1) as? Number)?.toInt() ?: 0).coerceIn(0, 3)
			// The size the page shows it at, in screen pixels (0 = the old default).
			val targetPx = (args.getOrNull(2) as? Number)?.toInt() ?: 0
			val fps = if (anim == Anim.IDLE) (look as? SheetLook)?.idleFps ?: 8f else 16f
			val count = if (anim == Anim.IDLE) (look as? SheetLook)?.idleFrameCount ?: 12
				else kotlin.math.ceil(look.duration(anim).coerceIn(1f, 6f) * fps).toInt()
			// Repeated frames carry timing; removing duplicates speeds up held poses.
			val sheetLook = look as? SheetLook
			sheetLook?.preview = true
			val bitmaps = try {
				(0 until count).mapNotNull { look.frame(anim, it / fps, if (anim == Anim.REACTION) still else -1) }
			} finally { sheetLook?.preview = false }
			if (bitmaps.isEmpty()) return@registerNativeMethod false
			// One image for the whole animation, the frames in a grid (at most four across: a single long
			// row can be too wide for some phones to draw). The page slides it from frame to frame instead
			// of swapping images, which blanked for a moment on every change: the flicker.
			val fw = bitmaps[0].width
			val fh = bitmaps[0].height
			val scale = if (targetPx > 0) maxOf(1, targetPx / maxOf(fw, fh)) else maxOf(1, 240 / maxOf(fw, fh / 2))
			val cols = minOf(bitmaps.size, 4)
			val rows = (bitmaps.size + cols - 1) / cols
			val grid = android.graphics.Bitmap.createBitmap(fw * cols, fh * rows, android.graphics.Bitmap.Config.ARGB_8888)
			val canvas = android.graphics.Canvas(grid)
			for ((i, b) in bitmaps.withIndex()) canvas.drawBitmap(b, ((i % cols) * fw).toFloat(), ((i / cols) * fh).toFloat(), null)
			val result = mapOf(
				"sheet" to dataUri(grid, scale = scale), "cols" to cols, "n" to bitmaps.size, "fps" to fps,
				"w" to fw * scale, "h" to fh * scale,
			)
			synchronized(previewCache) { previewCache[cacheKey] = result }
			result
		}
		// "Blow bubbles" on the settings page, to see them without waiting.
		registerNativeMethod("${manifest.id}.blow") { _ ->
			mainHandler.post { runCatching { Pet.blow(force = true) } }
			true
		}
		// "Cast a spell now" on the settings page.
		registerNativeMethod("${manifest.id}.castMagic") { _ ->
			mainHandler.post { runCatching { Pet.castMagic(force = true) } }
			true
		}
		// "Drop a treat now" on the settings page.
		registerNativeMethod("${manifest.id}.dropTreat") { _ ->
			mainHandler.post { runCatching { Pet.dropTreat(force = true) } }
			true
		}
		registerNativeMethod("${manifest.id}.giveBack") { _ ->
			mainHandler.post { runCatching { Eater.restoreAll() } }
			true
		}
	}

	stop {
		mainHandler.post { runCatching { Pet.stopNow() } }
	}
}
