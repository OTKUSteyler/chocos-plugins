export interface Badge {
    key: BadgeKey;
    name: string;
    src: string;
}

export type BadgeKey =
    | "EquicordDonor"
    | "VencordDonor"
    | "DiscordProfile"
    | "DiscordNitro";

// [bit, name, icon hash]
export const discordBadges: readonly [number, string, string][] = [
    [0, "Discord Staff", "5e74e9b61934fc1f67c65515d1f7e60d"],
    [1, "Partnered Server Owner", "3f9748e53446a137a052f3454e2de41e"],
    [2, "HypeSquad Events", "bf01d1073931f921909045f3a39fd264"],
    [6, "HypeSquad Bravery", "8a88d63823d8a71cd5e390baa45efa02"],
    [7, "HypeSquad Brilliance", "011940fd013da3f7fb926e4a1cd2e618"],
    [8, "HypeSquad Balance", "3aa41de486fa12454c3761e8e223442e"],
    [3, "Discord Bug Hunter", "2717692c7dca7289b35297368a940dd0"],
    [14, "Discord Bug Hunter", "848f79194d4be5ff5f81505cbd0ce1e6"],
    [17, "Early Verified Bot Developer", "6df5892e0f35b051f8b61eace34f4967"],
    [9, "Early Supporter", "7060786766c9c840eb3019e725d2b358"],
    [18, "Moderator Programs Alumni", "fee1624003e2fee35cb398e125dc479b"],
];

const NITRO_ICON = "https://cdn.discordapp.com/badge-icons/2ba85e8026a8614b640c2837bcdfe21b.png";

type DonorMap = Record<string, { tooltip: string; badge: string; }[]>;

let vencordDonors: DonorMap = {};
let equicordDonors: DonorMap = {};

async function load(url: string): Promise<DonorMap> {
    try {
        const res = await fetch(url);
        return await res.json();
    } catch {
        return {};
    }
}

const loadListeners = new Set<() => void>();

/** Re-render badge rows once the donor lists have arrived. */
export function subscribeBadgeLoad(fn: () => void) {
    loadListeners.add(fn);
    return () => void loadListeners.delete(fn);
}

export async function loadDonorBadges() {
    [vencordDonors, equicordDonors] = await Promise.all([
        load("https://badges.vencord.dev/badges.json"),
        load("https://badge.equicord.org/badges.json"),
    ]);
    for (const fn of loadListeners) fn();
}

export function getBadgesFor(user: any, enabled: Record<BadgeKey, boolean>): Record<BadgeKey, Badge[]> {
    const out: Record<BadgeKey, Badge[]> = {
        EquicordDonor: [],
        VencordDonor: [],
        DiscordProfile: [],
        DiscordNitro: [],
    };
    if (!user?.id) return out;

    if (enabled.EquicordDonor) {
        out.EquicordDonor = (equicordDonors[user.id] ?? []).map(b => ({
            key: "EquicordDonor", name: b.tooltip, src: b.badge,
        }));
    }
    if (enabled.VencordDonor) {
        out.VencordDonor = (vencordDonors[user.id] ?? []).map(b => ({
            key: "VencordDonor", name: b.tooltip, src: b.badge,
        }));
    }
    if (enabled.DiscordProfile) {
        const flags = user.flags ?? user.publicFlags ?? 0;
        out.DiscordProfile = discordBadges
            .filter(b => flags & (1 << b[0]))
            .map(b => ({
                key: "DiscordProfile",
                name: b[1],
                src: `https://cdn.discordapp.com/badge-icons/${b[2]}.png`,
            }));
    }
    if (enabled.DiscordNitro && (user.premiumType ?? 0) > 0) {
        out.DiscordNitro = [{
            key: "DiscordNitro",
            name: "Discord Nitro" + (user.premiumType === 3 ? " Basic" : user.premiumType === 1 ? " Classic" : ""),
            src: NITRO_ICON,
        }];
    }
    return out;
}
