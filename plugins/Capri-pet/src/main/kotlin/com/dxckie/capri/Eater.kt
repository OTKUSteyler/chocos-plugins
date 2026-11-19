package com.dxckie.capri

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.SurfaceView
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import android.view.animation.AccelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import kotlin.math.hypot
import kotlin.random.Random

/**
 * "Eats the UI": now and then Sparkle picks a small button or icon near it, the real view is made
 * invisible, and a snapshot of it flies into Sparkle's mouth. Tapping Sparkle spits everything back.
 *
 * Nothing is removed or changed except the eaten view's alpha, which is put back exactly as it was on
 * a spit, on hide, on plugin stop, or if the view goes away. React Native may redraw a view with its
 * own alpha in the meantime, which simply un-eats it; [prune] notices and forgets it.
 */
internal object Eater {
	private class Item(val view: View, val alpha: Float, val bitmap: Bitmap, val w: Int, val h: Int)

	/** How many it holds at once without grudges; with them, see [maxEaten]. */
	private const val MAX_EATEN = 5
	private const val SCAN_LIMIT = 900

	private var decor: ViewGroup? = null
	private val eaten = ArrayList<Item>()
	private val flying = ArrayList<View>()
	private var nextEat = 25f
	/** When it last ate something (Pet's clock), for giving things back on its own when it adores you. */
	var lastBite = 0f
		private set

	fun attach(root: ViewGroup) {
		decor = root
	}

	fun detach() {
		restoreAll()
		decor = null
	}

	fun hasEaten() = eaten.isNotEmpty()

	fun ready(now: Float) = now >= nextEat && eaten.size < maxEaten()

	/** With grudges on: 1 when it adores you, 3, 5, 8, then 12 when it holds a grudge. */
	private fun maxEaten(): Int = if (!Settings.grudges) MAX_EATEN else when (Pet.repTier()) {
		2 -> 1
		1 -> 3
		0 -> MAX_EATEN
		-1 -> 8
		else -> 12
	}

	/** A grudge bite: it comes back for more within a few seconds. */
	fun hurry(now: Float) {
		nextEat = minOf(nextEat, now + 3f)
	}

	/**
	 * The wait before the next bite: 40-120 s at Sometimes, scaled by [Settings.eatRate], and with
	 * grudges on by reputation (about 5.7x longer when it adores you, 5.7x shorter at a grudge).
	 */
	private fun wait() = (Random.nextFloat() * 80f + 40f) * rateScale(Settings.eatRate) * Pet.repWaitScale()

	fun reschedule(now: Float) {
		nextEat = now + wait()
	}

	/** Forgets anything that has become visible again on its own (a re-render, a new screen). */
	fun prune() {
		eaten.removeAll { !it.view.isAttachedToWindow || it.view.alpha > 0.01f }
	}

	private fun locationIn(root: View, view: View): IntArray {
		val rootLoc = IntArray(2)
		val loc = IntArray(2)
		root.getLocationInWindow(rootLoc)
		view.getLocationInWindow(loc)
		return intArrayOf(loc[0] - rootLoc[0], loc[1] - rootLoc[1])
	}

	/** A leaf view that is small, fully visible, not text entry, not video, not inside a list. */
	private fun pickTarget(top: Float, cx: Float, cy: Float): Triple<View, Int, Int>? {
		val root = decor ?: return null
		val content = root.findViewById<View>(android.R.id.content) ?: return null
		val width = root.width
		val height = root.height
		val minSide = dp(14f)
		val maxW = width * 0.6f
		val maxH = dp(140f)
		val candidates = ArrayList<Triple<View, Int, Int>>()
		val stack = ArrayDeque<Triple<View, Float, Boolean>>()
		stack.addLast(Triple(content, 1f, false))
		var visited = 0
		while (stack.isNotEmpty() && visited < SCAN_LIMIT) {
			val (view, parentAlpha, inList) = stack.removeLast()
			visited++
			if (view.visibility != View.VISIBLE) continue
			val alpha = parentAlpha * view.alpha
			if (alpha < 0.6f || view.width <= 0 || view.height <= 0) continue
			if (view is ViewGroup && view.childCount > 0) {
				// Discord's chat is a native RecyclerView; its rows are recycled, so never eat from lists.
				val list = inList || view.javaClass.name.contains("RecyclerView")
				for (i in 0 until view.childCount) stack.addLast(Triple(view.getChildAt(i), alpha, list))
				continue
			}
			if (inList || view.width < minSide || view.height < minSide || view.width > maxW || view.height > maxH) continue
			if (view is EditText || view is SurfaceView || view is TextureView) continue
			if (view.scaleX < 0.9f || view.scaleY < 0.9f || view.rotation != 0f) continue
			val (x, y) = locationIn(root, view).let { it[0] to it[1] }
			if (x < 0 || y < top || x + view.width > width || y + view.height > height) continue
			candidates.add(Triple(view, x, y))
		}
		if (candidates.isEmpty()) return null
		// Nearby things are much likelier to be eaten.
		val reach = dp(160f)
		val weights = candidates.map { (v, x, y) ->
			val d = hypot(x + v.width / 2f - cx, y + v.height / 2f - cy) / reach
			1f / (1f + d * d)
		}
		var roll = Random.nextFloat() * weights.sum()
		for ((i, weight) in weights.withIndex()) {
			roll -= weight
			if (roll <= 0f) return candidates[i]
		}
		return candidates.last()
	}

	private fun snapshot(view: View): Bitmap {
		val bmp = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
		val canvas = Canvas(bmp)
		canvas.translate(-view.scrollX.toFloat(), -view.scrollY.toFloat())
		view.draw(canvas)
		return bmp
	}

	private fun copyOf(bitmap: Bitmap, w: Int, h: Int): ImageView? {
		val root = decor ?: return null
		val copy = ImageView(root.context)
		copy.setImageBitmap(bitmap)
		copy.scaleType = ImageView.ScaleType.FIT_XY
		root.addView(copy, FrameLayout.LayoutParams(w, h))
		flying.add(copy)
		return copy
	}

	private fun dropCopy(copy: View) {
		flying.remove(copy)
		(copy.parent as? ViewGroup)?.removeView(copy)
	}

	fun tryEat(now: Float, top: Float, mouthX: Float, mouthY: Float, cx: Float, cy: Float): Boolean {
		return runCatching {
			val (view, x, y) = pickTarget(top, cx, cy) ?: return false
			val item = Item(view, view.alpha, snapshot(view), view.width, view.height)
			view.alpha = 0f
			eaten.add(item)
			val copy = copyOf(item.bitmap, item.w, item.h) ?: return false
			copy.translationX = x.toFloat()
			copy.translationY = y.toFloat()
			Pet.onEatStart(x + item.w / 2f)
			lastBite = now
			nextEat = now + wait()
			copy.animate()
				.translationX(mouthX - item.w / 2f).translationY(mouthY - item.h / 2f)
				.scaleX(0.05f).scaleY(0.05f)
				.rotation((if (Random.nextBoolean()) 1 else -1) * (Random.nextFloat() * 180f + 120f))
				.setInterpolator(AccelerateInterpolator(1.6f))
				.setDuration(560)
				.withEndAction {
					dropCopy(copy)
					Pet.onSwallowed()
				}
				.start()
			true
		}.getOrElse {
			nextEat = now + 10f
			false
		}
	}

	fun spitAll(now: Float, mouthX: Float, mouthY: Float) {
		val items = eaten.toList()
		eaten.clear()
		nextEat = maxOf(nextEat, now + wait())
		items.forEachIndexed { i, item -> spitOne(item, mouthX, mouthY, i * 80L) }
	}

	private fun spitOne(item: Item, mouthX: Float, mouthY: Float, delay: Long) {
		val root = decor
		if (root == null || !item.view.isAttachedToWindow) {
			restore(item)
			return
		}
		runCatching {
			val (x, y) = locationIn(root, item.view).let { it[0] to it[1] }
			val copy = copyOf(item.bitmap, item.w, item.h) ?: return restore(item)
			copy.translationX = mouthX - item.w / 2f
			copy.translationY = mouthY - item.h / 2f
			copy.scaleX = 0.01f
			copy.scaleY = 0.01f
			copy.rotation = (if (Random.nextBoolean()) 1 else -1) * (Random.nextFloat() * 180f + 120f)
			copy.animate()
				.translationX(x.toFloat()).translationY(y.toFloat())
				.scaleX(1f).scaleY(1f).rotation(0f)
				.setInterpolator(OvershootInterpolator(1.2f))
				.setStartDelay(delay)
				.setDuration(460)
				.withEndAction {
					dropCopy(copy)
					restore(item)
				}
				.start()
		}.onFailure { restore(item) }
	}

	private fun restore(item: Item) {
		runCatching { if (item.view.alpha < 0.01f) item.view.alpha = item.alpha }
	}

	/** Spit back with the animation if possible, otherwise put everything back at once. */
	fun giveBackNow() {
		restoreAll()
	}

	/** Puts every eaten view back instantly and clears any copies in flight. */
	fun restoreAll() {
		val items = eaten.toList()
		eaten.clear()
		for (copy in flying.toList()) dropCopy(copy)
		items.forEach(::restore)
	}
}
