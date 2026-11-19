package com.dxckie.capri

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Rect
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RectF
import android.graphics.drawable.Drawable
import android.os.SystemClock
import android.view.Choreographer
import android.view.ViewGroup
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

/**
 * Capri's possession, in place of bubbles: she dives into the screen. Red lightning runs round its
 * frame, eyes open across it with pupils that follow her, then they close and it all fades.
 * With the screen glitch on, bars of red, purple and green tear across the screen as well.
 * Drawn on the window's overlay, so it works on any Android. Main thread only.
 */
internal object Possess {
	private const val SECONDS = 3.6f
	private const val EYES = 8

	private class Eye(val x: Float, val y: Float, val r: Float, val open: Float, val close: Float)

	private val red = Paint().apply { color = 0xFFFF003D.toInt(); style = Paint.Style.STROKE; strokeWidth = dp(2.2f); isAntiAlias = false }
	private val purple = Paint().apply { color = 0xFFB44CFF.toInt(); style = Paint.Style.STROKE; strokeWidth = dp(1.6f); isAntiAlias = false }
	private val pink = Paint().apply { color = 0xFFFF96BE.toInt(); style = Paint.Style.STROKE; strokeWidth = dp(1.2f); isAntiAlias = false }
	private val fill = Paint().apply { style = Paint.Style.FILL; isAntiAlias = true }

	private var decor: ViewGroup? = null
	private var layer: Layer? = null
	private var running = false
	private var startedAt = 0f
	private var capriX = 0f
	private var capriY = 0f
	private var eyes = emptyList<Eye>()

	private fun now() = SystemClock.uptimeMillis() / 1000f

	val active get() = running

	/** Starts it, from Capri at ([x], [y]). Does nothing while one is already playing. */
	fun start(root: ViewGroup, x: Float, y: Float) {
		if (running) return
		decor = root
		capriX = x; capriY = y
		startedAt = now()
		val w = root.width.toFloat(); val h = root.height.toFloat()
		// Her face in the middle (two big eyes, the mouth below), small eyes scattered round it.
		val close = SECONDS - 0.7f
		eyes = listOf(
			Eye(w * 0.39f, h * 0.42f, w * 0.065f, 0.45f, close),
			Eye(w * 0.60f, h * 0.42f, w * 0.065f, 0.55f, close),
		) + List(EYES) {
			Eye(
				w * (0.08f + Random.nextFloat() * 0.84f), h * (0.1f + Random.nextFloat() * 0.8f),
				w * (0.018f + Random.nextFloat() * 0.03f), 0.5f + Random.nextFloat() * 1.0f, close - 0.3f + Random.nextFloat() * 0.5f,
			)
		}
		layer = Layer().also { root.overlay.add(it) }
		running = true
		Choreographer.getInstance().postFrameCallback(frame)
	}

	fun follow(x: Float, y: Float) { capriX = x; capriY = y }

	fun clear() {
		running = false
		Choreographer.getInstance().removeFrameCallback(frame)
		layer?.let { l -> decor?.overlay?.remove(l) }
		layer = null
		decor = null
	}

	private val frame = object : Choreographer.FrameCallback {
		override fun doFrame(frameTimeNanos: Long) {
			if (!running) return
			if (now() - startedAt > SECONDS) { clear(); return }
			layer?.invalidateSelf()
			Choreographer.getInstance().postFrameCallback(this)
		}
	}

	private class Layer : Drawable() {
		private val clip = Path()
		private var bmp: Bitmap? = null
		private var bmpCanvas: Canvas? = null
		private val blit = Paint().apply { isFilterBitmap = false }
		private val spark = Paint().apply { style = Paint.Style.FILL }
		private val mouth = Paint().apply { isAntiAlias = false }
		private val bar = Paint().apply { style = Paint.Style.FILL }

		override fun draw(canvas: Canvas) {
			val root = decor ?: return
			if (bounds.width() != root.width || bounds.height() != root.height) setBounds(0, 0, root.width, root.height)
			val w = root.width.toFloat(); val h = root.height.toFloat()
			val t = now() - startedAt
			// Fades in over the first 0.3 s and out over the last 0.5 s.
			val fade = min(min(t / 0.3f, (SECONDS - t) / 0.5f), 1f).coerceIn(0f, 1f)
			val tick = (t * 24f).toInt()
			// Drawn small and scaled up unsmoothed, then blitted in bands, a few slid sideways: the same
			// pixelated, glitchy look as her teleport bolt (Bolt.kt).
			val pix = dp(2.2f)
			val bw = max(1, (w / pix).toInt() + 1); val bh = max(1, (h / pix).toInt() + 1)
			if (bmp?.width != bw || bmp?.height != bh) { bmp?.recycle(); bmp = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888); bmpCanvas = Canvas(bmp!!) }
			val bm = bmp ?: return; val bc = bmpCanvas ?: return
			bm.eraseColor(0)
			bc.save(); bc.scale(1f / pix, 1f / pix)
			if (Settings.bubbleFx) drawGlitch(bc, w, h, tick, fade)
			for ((i, e) in eyes.withIndex()) drawEye(bc, e, i, t, fade)
			drawMouth(bc, w, h, t, fade)
			bc.restore()
			drawFrame(canvas, w, h, tick, fade)
			val rnd = Random(tick * 17 + 5)
			var y = 0
			while (y < bm.height) {
				val bandH = min(4, bm.height - y)
				val dx = if (rnd.nextFloat() < 0.04f) rnd.nextInt(-3, 4) * pix * 0.6f else 0f
				canvas.drawBitmap(bm, Rect(0, y, bm.width, y + bandH), RectF(dx, y * pix, dx + bm.width * pix, (y + bandH) * pix), blit)
				y += bandH
			}
		}

		/** A jagged bolt running the whole way round the screen edge, redrawn 24 times a second. */
		private fun drawFrame(canvas: Canvas, w: Float, h: Float, tick: Int, fade: Float) {
			val rnd = Random((tick / 2) * 31 + 7)                      // bolt re-rolls 12 times a second, not 24
			val inset = dp(5f); val jag = dp(3f); val step = dp(15f)
			val path = Path()
			var first = true
			fun pt(x: Float, y: Float, nx: Float, ny: Float) {
				val o = (rnd.nextFloat() - 0.5f) * 2f * jag
				val px = x + nx * o; val py = y + ny * o
				if (first) { path.moveTo(px, py); first = false } else path.lineTo(px, py)
			}
			var x = inset; while (x < w - inset) { pt(x, inset, 0f, 1f); x += step }
			var y = inset; while (y < h - inset) { pt(w - inset, y, 1f, 0f); y += step }
			x = w - inset; while (x > inset) { pt(x, h - inset, 0f, 1f); x -= step }
			y = h - inset; while (y > inset) { pt(inset, y, 1f, 0f); y -= step }
			path.close()
			val a = (fade * 255).toInt()
			purple.alpha = a; pink.alpha = a; red.alpha = a
			canvas.save(); canvas.translate(dp(2f), -dp(1f)); canvas.drawPath(path, purple); canvas.restore()
			canvas.save(); canvas.translate(-dp(2f), dp(1f)); canvas.drawPath(path, pink); canvas.restore()
			canvas.drawPath(path, red)
		}

		/** Thin horizontal bars of red, purple and green that jump about, like a torn picture. */
		private fun drawGlitch(canvas: Canvas, w: Float, h: Float, tick: Int, fade: Float) {
			val rnd = Random((tick / 2) * 131 + 3)
			repeat(5) {
				val y = rnd.nextFloat() * h
				val x0 = rnd.nextFloat() * w * 0.7f
				val len = w * (0.1f + rnd.nextFloat() * 0.5f)
				bar.color = when (rnd.nextInt(3)) { 0 -> 0xFFFF003D.toInt(); 1 -> 0xFF7A3DFF.toInt(); else -> 0xFF00F452.toInt() }
				bar.alpha = (fade * (90 + rnd.nextInt(120))).toInt()
				canvas.drawRect(x0, y, x0 + len, y + dp(1.5f + rnd.nextFloat() * 2f), bar)
			}
		}

		/** Her laugh: a white zigzag with a dark edge under the eyes, shaking as she laughs. */
		private fun drawMouth(canvas: Canvas, w: Float, h: Float, t: Float, fade: Float) {
			val k = min(((t - 0.8f) / 0.2f).coerceIn(0f, 1f), ((SECONDS - 0.7f - t) / 0.2f).coerceIn(0f, 1f))
			if (k <= 0f) return
			val er = w * 0.065f
			val amp = er * 0.42f * (0.85f + 0.15f * sin(t * 24f)) * k
			val x0 = w * 0.34f; val x1 = w * 0.66f; val y = h * 0.42f + er * 2.1f
			val path = Path()
			val n = 6
			for (i in 0..n) {
				val px = x0 + (x1 - x0) * i / n; val py = y + if (i % 2 == 0) amp else -amp
				if (i == 0) path.moveTo(px, py) else path.lineTo(px, py)
			}
			mouth.style = Paint.Style.STROKE; mouth.strokeJoin = Paint.Join.MITER
			mouth.color = 0xFF14101F.toInt(); mouth.strokeWidth = w * 0.022f; mouth.alpha = (fade * 255).toInt()
			canvas.drawPath(path, mouth)
			mouth.color = 0xFFFFFFFF.toInt(); mouth.strokeWidth = w * 0.011f; mouth.alpha = (fade * 255).toInt()
			canvas.drawPath(path, mouth)
		}

		/** One eye: green ring, blue iris and a white pupil turned toward Capri; opens, blinks, shuts. */
		private fun drawEye(canvas: Canvas, e: Eye, i: Int, t: Float, fade: Float) {
			val opening = ((t - e.open) / 0.25f).coerceIn(0f, 1f)
			val closing = ((e.close - t) / 0.25f).coerceIn(0f, 1f)
			// A quick blink now and then in between.
			val blink = if (((t * 1.3f + i * 0.37f) % 2.4f) < 0.12f) 0.15f else 1f
			val openness = min(opening, closing) * blink
			if (openness <= 0.02f) return
			val ang = atan2(capriY - e.y, capriX - e.x)
			val dist = min(hypot(capriX - e.x, capriY - e.y) / dp(200f), 1f)
			val shift = e.r * 0.28f * dist
			val ex = cos(ang) * shift; val ey = sin(ang) * shift
			canvas.save()
			canvas.translate(e.x, e.y)
			canvas.scale(1f, openness)
			clip.reset(); clip.addOval(RectF(-e.r, -e.r, e.r, e.r), Path.Direction.CW)
			canvas.clipPath(clip)
			fill.color = 0xFF6A3DFF.toInt(); fill.alpha = (fade * 255).toInt()
			canvas.drawCircle(0f, 0f, e.r, fill)
			fill.color = 0xFF00F452.toInt(); fill.alpha = (fade * 255).toInt()
			canvas.drawCircle(0f, 0f, e.r - dp(2f), fill)
			fill.color = 0xFF3D6BFF.toInt(); fill.alpha = (fade * 255).toInt()
			canvas.drawCircle(ex, ey, e.r * 0.62f, fill)
			fill.color = 0xFFFFFFFF.toInt(); fill.alpha = (fade * 255).toInt()
			canvas.drawOval(ex - e.r * 0.15f, ey - e.r * 0.26f, ex + e.r * 0.15f, ey + e.r * 0.26f, fill)
			canvas.restore()
		}

		override fun setAlpha(alpha: Int) {}
		override fun setColorFilter(colorFilter: ColorFilter?) {}
		@Deprecated("Deprecated in Java")
		override fun getOpacity() = PixelFormat.TRANSLUCENT
	}
}
