package com.dxckie.showbadges

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.BitmapDrawable
import android.os.Handler
import android.os.Looper
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ImageSpan
import android.view.View
import android.view.ViewGroup
import android.util.TypedValue
import android.widget.RelativeLayout
import android.widget.TextView
import app.valenced.xposed.api.DexFinder
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import org.json.JSONObject
import java.lang.reflect.Method
import java.net.URL
import java.util.WeakHashMap
import java.util.concurrent.Executors

private const val MESSAGE_VIEW = "com.discord.chat.presentation.message.MessageView"
private const val MESSAGE = "com.discord.chat.bridge.Message"

// JS appends this to badge icon URLs so the image hook knows which icons are ours
private const val MARKER = "#dxckie.show-badges"
private const val CACHE_CAPACITY = 2000
private const val BADGE_SCALE = 1.15f

/** Arguments of `TextUtils.appendImage`, found by type (R8 merged it with its `$default` overload). */
private class AppendImageArgs(method: Method) {
    private val types = method.parameterTypes
    val url = types.indexOf(String::class.java)
    private val cornerRadius = types.indexOf(Float::class.javaPrimitiveType)
    private val mask = types.lastIndex

    fun clearCornerRadius(args: Array<Any?>) {
        args[cornerRadius] = 0f
        // Bits count from the first argument after the builder, the receiver
        args[mask] = (args[mask] as Int) and (1 shl (cornerRadius - 1)).inv()
    }
}

/** A row of badges under a message header. */
private class BadgeRow(val view: RelativeLayout, val header: View, val text: TextView) {
    var messageId: String? = null
}

internal class BadgeHooks(dexFinder: DexFinder) {
    // message id -> badge icon URLs
    private val badges = object : LinkedHashMap<String, List<String>>(256, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, List<String>>) = size > CACHE_CAPACITY
    }

    // Main thread only
    private val rows = WeakHashMap<RelativeLayout, BadgeRow>()
    private val images = object : LinkedHashMap<String, Bitmap>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Bitmap>) = size > 200
    }
    private val loading = HashSet<String>()
    private val io = Executors.newFixedThreadPool(2)
    private val mainHandler = Handler(Looper.getMainLooper())
    private var ids: ViewIds? = null

    private val messageIdField = dexFinder.classLoader.loadClass(MESSAGE).getDeclaredField("id")
        .apply { isAccessible = true }

    private val unhooks: List<XC_MethodHook.Unhook>

    init {
        val appendImage = dexFinder.findMethod {
            matcher { usingEqStrings("rc", "imageUrl") }
        } ?: error("TextUtils.appendImage not found")
        val args = AppendImageArgs(appendImage)

        val setMessage = dexFinder.findMethod {
            matcher {
                declaredClass(MESSAGE_VIEW)
                usingEqStrings("message", "messageContext", "eventHandler")
            }
        } ?: error("MessageView.setMessage not found")

        unhooks = listOf(
            // Discord rounds inline images by default, which cuts off the quest badge
            XposedBridge.hookMethod(appendImage, object : XC_MethodHook() {
                override fun beforeHookedMethod(param: MethodHookParam) {
                    val url = param.args[args.url] as? String ?: return
                    val index = url.indexOf(MARKER)
                    if (index < 0) return
                    param.args[args.url] = url.substring(0, index)
                    args.clearCornerRadius(param.args)
                }
            }),
            XposedBridge.hookMethod(setMessage, object : XC_MethodHook() {
                override fun afterHookedMethod(param: MethodHookParam) {
                    try {
                        val view = param.thisObject as RelativeLayout
                        val id = messageIdField.get(param.args[0]) as String
                        val ids = ids ?: ViewIds(view).also { ids = it }
                        val header = view.childWithId(ids.header) ?: return
                        val name = header.findViewById<View>(ids.authorName) as? TextView ?: return
                        // Only messages that start a group show their author
                        val shows = name.visibility == View.VISIBLE
                        val row = rows[view]
                            ?: if (shows && !badgesOf(id).isNullOrEmpty()) insertRow(view, header, name) else return
                        row.messageId = id.takeIf { shows }
                        render(row)
                    } catch (e: Throwable) {
                        XposedBridge.log("ShowBadges: header hook failed: $e")
                    }
                }
            }),
        )
    }

    private class ViewIds(view: View) {
        val header = view.idOf("header")
        val authorName = view.idOf("author_name")
    }

    private fun badgesOf(id: String) = synchronized(badges) { badges[id] }

    fun put(json: String) {
        val updates = JSONObject(json).let { obj ->
            obj.keys().asSequence().associateWith { key ->
                obj.getJSONArray(key).let { array -> List(array.length(), array::getString) }
            }
        }
        synchronized(badges) { badges.putAll(updates) }
        mainHandler.post {
            for (row in rows.values) if (row.messageId in updates) render(row)
        }
    }

    fun clear() {
        synchronized(badges) { badges.clear() }
    }

    fun dispose() {
        for (unhook in unhooks) unhook.unhook()
        io.shutdownNow()
        synchronized(badges) { badges.clear() }
        mainHandler.post {
            for (row in rows.values) {
                follow(row, row.header.id)
                row.view.removeView(row.text)
            }
            rows.clear()
            images.clear()
        }
    }

    // Under the header, with what was under the header moved under the row
    private fun insertRow(view: RelativeLayout, header: View, name: TextView): BadgeRow {
        val text = TextView(view.context).apply {
            id = View.generateViewId()
            visibility = View.GONE
            setTextSize(TypedValue.COMPLEX_UNIT_PX, name.textSize * 0.9f)
        }
        val headerParams = header.layoutParams as RelativeLayout.LayoutParams
        view.addView(text, RelativeLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply {
            addRule(RelativeLayout.BELOW, header.id)
            marginStart = headerParams.marginStart
        })
        return BadgeRow(view, header, text).also { rows[view] = it }
    }

    // Discord's own views can sit under the header, and the row has to push them down
    private fun follow(row: BadgeRow, anchor: Int) {
        val from = if (anchor == row.text.id) row.header.id else row.text.id
        for (i in 0 until row.view.childCount) {
            val child = row.view.getChildAt(i)
            if (child === row.text) continue
            val params = child.layoutParams as? RelativeLayout.LayoutParams ?: continue
            if (params.rules[RelativeLayout.BELOW] == from) {
                params.addRule(RelativeLayout.BELOW, anchor)
                child.layoutParams = params
            }
        }
    }

    private fun render(row: BadgeRow) {
        val urls = row.messageId?.let(::badgesOf).orEmpty()
        val text = SpannableStringBuilder()
        val size = (row.text.textSize * BADGE_SCALE).toInt()
        val gap = size / 8
        for (url in urls) {
            val bitmap = images[url]
            if (bitmap == null) {
                load(url)
                continue
            }
            val start = text.length
            text.append("\uFFFC")
            text.setSpan(
                GapDrawableSpan(BitmapDrawable(row.text.resources, bitmap).apply { setBounds(0, 0, size, size) }, gap),
                start, start + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
            )
            // Lines of only spaces never wrap, a zero width space is a place to break
            text.append("\u200B")
        }
        val show = text.isNotEmpty()
        row.text.text = text
        row.text.visibility = if (show) View.VISIBLE else View.GONE
        follow(row, if (show) row.text.id else row.header.id)
    }

    private fun load(url: String) {
        if (!loading.add(url)) return
        io.execute {
            val bitmap = try {
                URL(url).openStream().use(BitmapFactory::decodeStream)
            } catch (_: Throwable) {
                null
            }
            mainHandler.post {
                loading.remove(url)
                if (bitmap == null) return@post
                images[url] = bitmap
                for (row in rows.values) if (url in row.messageId?.let(::badgesOf).orEmpty()) render(row)
            }
        }
    }
}

/** Image span with space after it. */
private class GapDrawableSpan(drawable: android.graphics.drawable.Drawable, private val gap: Int) :
    ImageSpan(drawable, ALIGN_BOTTOM) {
    override fun getSize(
        paint: android.graphics.Paint, text: CharSequence?, start: Int, end: Int, fm: android.graphics.Paint.FontMetricsInt?,
    ) = super.getSize(paint, text, start, end, fm) + gap
}

@Suppress("DiscouragedApi")
private fun View.idOf(name: String) = resources.getIdentifier(name, "id", context.packageName)

// Not findViewById, as nested messages (such as replies) have views with the same IDs
private fun ViewGroup.childWithId(id: Int): View? =
    (0 until childCount).asSequence().map(::getChildAt).firstOrNull { it.id == id }
