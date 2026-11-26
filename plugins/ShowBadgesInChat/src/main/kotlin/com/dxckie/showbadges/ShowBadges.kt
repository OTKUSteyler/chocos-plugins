@file:JvmName("ShowBadges")

package com.dxckie.showbadges

import app.valenced.bridge.asDelegate
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod

/** Draws badge icons unclipped, and shows badges beside the author name in message headers. */
@Suppress("UNUSED")
val showBadges = plugin {
    var hooks: BadgeHooks? = null

    start {
        hooks = BadgeHooks(dexFinder)

        registerNativeMethod("dxckie.badges.put") { args ->
            val json by args.asDelegate().string()
            hooks?.put(json)
            null
        }

        registerNativeMethod("dxckie.badges.clear") {
            hooks?.clear()
            null
        }
    }

    stop {
        hooks?.dispose()
        hooks = null
    }
}
