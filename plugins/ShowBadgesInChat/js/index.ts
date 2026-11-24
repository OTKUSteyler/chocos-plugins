import { findByName } from "@vendetta/metro";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";

import { type Badge, type BadgeKey, getBadgesFor, loadDonorBadges } from "./badges";
import { initSettings, Settings } from "./Settings";

const unpatches: (() => void)[] = [];

function BadgeRow({ author }: { author: any; }) {
    const badges = getBadgesFor(author, storage.shown);
    const flat: Badge[] = (storage.order as BadgeKey[]).flatMap(k => badges[k]);
    if (!flat.length) return null;

    return (
        <RN.View style={{ flexDirection: "row", alignItems: "center", marginLeft: 4 }}>
            {flat.map((b, i) => (
                <RN.Image
                    key={`${b.key}-${i}`}
                    source={{ uri: b.src }}
                    accessibilityLabel={b.name}
                    style={{ width: 16, height: 16, marginRight: 2 }}
                />
            ))}
        </RN.View>
    );
}

export default {
    onLoad() {
        initSettings();
        loadDonorBadges();

        // Message header (username row). The exact component name can change between
        // Discord versions; "MessageHeader" is checked first, with a fallback.
        const Header =
            findByName("MessageHeader", false) ??
            findByName("UserNameTitle", false);

        if (!Header) {
            console.warn("[ShowBadgesInChat] could not find message header component");
            return;
        }

        unpatches.push(
            after("default", Header, ([props]: any[], ret: any) => {
                const author = props?.message?.author ?? props?.author;
                if (!author || !ret?.props) return ret;

                const children = ret.props.children;
                const badge = <BadgeRow author={author} />;
                ret.props.children = Array.isArray(children) ? [...children, badge] : [children, badge];
                return ret;
            })
        );
    },

    onUnload() {
        for (const u of unpatches) u();
        unpatches.length = 0;
    },

    settings: Settings,
};
