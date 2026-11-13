import { ApplicationCommandOptionType, after, findByName, loadStore, registerCommand, sendLocal } from "./compat";
import React from "react";
import PetOverlay from "./Pet";
import { DEFAULT_NAME, feed, newPet, nap, pat, play, speak, status, tick, type PetState } from "./pet";

const ACTIONS = ["status", "feed", "play", "pat", "nap", "say", "rename"] as const;

let unregister: (() => void) | undefined;
let unpatch: (() => void) | undefined;

export default {
    manifest: {
        id: "com.otkusteyler.capri-pet",
        name: "Capri Pet",
        version: "1.0.1",
        description: "A neon cyber-kitten pet that lives in your Discord.",
        authors: [{ name: "choco" }]
    },

    async start() {
        const pet = await loadStore<PetState>("capri-pet.json", newPet());
        if (!pet.name) Object.assign(pet, newPet());

        // Always-on-screen pet: render the overlay next to the app-level toast container,
        // which is mounted above every screen.
        const Host = findByName("AppToastContainer", false);
        if (Host) {
            unpatch = after("default", Host, (_args: any, ret: any) =>
                React.createElement(React.Fragment, null, ret, React.createElement(PetOverlay, { pet, save: () => {} })));
        } else {
            console.warn("[capri-pet] AppToastContainer not found; overlay disabled");
        }

        unregister = registerCommand({
            name: "pet",
            description: `Take care of your pet (${ACTIONS.join(", ")})`,
            shouldHide: () => false,
            options: [
                {
                    name: "action",
                    description: `One of: ${ACTIONS.join(", ")}`,
                    type: ApplicationCommandOptionType.STRING,
                    required: false
                },
                {
                    name: "value",
                    description: "New name (for rename)",
                    type: ApplicationCommandOptionType.STRING,
                    required: false
                },
                {
                    name: "public",
                    description: "Send it to the chat instead of just showing you",
                    type: ApplicationCommandOptionType.BOOLEAN,
                    required: false
                }
            ],
            execute(args, ctx) {
                const get = (n: string) => args.find(a => a.name === n)?.value as any;
                const action = String(get("action") ?? "status").toLowerCase();
                const isPublic = get("public") === true;

                tick(pet);
                let out: string;

                switch (action) {
                    case "feed": out = feed(pet); break;
                    case "play": out = play(pet); break;
                    case "pat": out = pat(pet); break;
                    case "nap": out = nap(pet); break;
                    case "say": out = speak(pet); break;
                    case "rename": {
                        const v = String(get("value") ?? "").trim().slice(0, 24);
                        pet.name = v || DEFAULT_NAME;
                        out = `Your pet is now called **${pet.name}**. 💫`;
                        break;
                    }
                    case "status": out = status(pet); break;
                    default: out = `Unknown action \`${action}\`. Try: ${ACTIONS.join(", ")}`;
                }

                if (isPublic) return { content: out };
                if (!sendLocal(ctx.channel.id, out)) return { content: out };
            }
        });
    },

    stop() {
        unpatch?.();
        unpatch = undefined;
        unregister?.();
        unregister = undefined;
    }
};
