import { getJsonStorage, pluginStoragePathFor } from "@valenced/json-storage";
import { createElement, Fragment } from "react";
import { PetHost } from "./Pet";
import PetOverlay from "./Pet";
import { newPet, tick, type PetState } from "./pet";

const ID = "com.otkusteyler.capri-pet";
const TAG = "[capri-pet]";

// Hosts that wrap the whole app (so we can watch touches and chase them), best first,
// then a fallback that can only draw the pet.
const FULL_HOSTS = ["AppContainer", "App"];
const OVERLAY_HOSTS = ["AppToastContainer"];

const pet: PetState = newPet();
let ready = false;
let saveTimer: any;
let storage: ReturnType<typeof getJsonStorage<PetState>> | undefined;

const save = () => {
    if (!ready || !storage) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => storage!.set({ ...pet, rev: undefined }, true), 400);
};

export default plugin({
    // Runs before the first render, so the patch is in place when the app mounts.
    init(api) {
        const { modules, patcher } = api.unscoped;
        const { waitForModules, filters } = modules.finders;
        const hosted = { done: false };

        const hook = (name: string, full: boolean) => {
            const unsub = waitForModules(filters.withName(name), ((...a: any[]) => {
                try {
                    if (hosted.done) return;
                    const id = Array.isArray(a[0]) && typeof a[0][1] === "number" ? a[0][1] : a[1];
                    const ns: any = typeof id === "number" ? (globalThis as any).__r(id) : undefined;

                    // The component may be a plain function, memo() or forwardRef().
                    let parent: any, key: string | undefined;
                    const d = ns?.default;
                    if (typeof d === "function") { parent = ns; key = "default"; }
                    else if (d && typeof d.type === "function") { parent = d; key = "type"; }
                    else if (d && typeof d.render === "function") { parent = d; key = "render"; }
                    if (!parent || !key) {
                        console.warn(TAG, `${name}: found module ${id} but no patchable component`, Object.keys(ns ?? {}));
                        return;
                    }

                    const unpatch = patcher.after(parent, key, (_args: any, ret: any) =>
                        full
                            ? createElement(PetHost, { pet, save }, ret)
                            : createElement(Fragment, null, ret, createElement(PetOverlay, { pet, save })));
                    api.cleanup(unpatch);
                    hosted.done = true;
                    console.log(TAG, `hosting on ${name} (module ${id}${full ? ", follows touches" : ", no touch tracking"})`);
                } catch (e) {
                    console.error(TAG, `failed to host on ${name}`, e);
                }
            }) as any);
            api.cleanup(unsub);
        };

        for (const n of FULL_HOSTS) hook(n, true);
        for (const n of OVERLAY_HOSTS) hook(n, false);
    },

    async start(api) {
        // Load the saved pet and hand it to the already-mounted overlay.
        storage = getJsonStorage<PetState>(pluginStoragePathFor(ID, "pet.json"), { default: newPet() });
        Object.assign(pet, (await storage.get()) as Partial<PetState>);
        tick(pet);
        pet.rev = (pet.rev ?? 0) + 1;
        ready = true;
        api.cleanup(() => clearTimeout(saveTimer));
        console.log(TAG, "started");
    }
});
