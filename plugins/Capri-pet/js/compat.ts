// Everything that touches the Valenced / Revenge-classic runtime lives here.
// Import paths follow the Revenge Classic bundle (@lib/api/commands, @lib/api/storage);
// if Valenced renamed any of them, this is the only file that needs changing.
import { registerCommand } from "@lib/api/commands";
import { ApplicationCommandOptionType } from "@lib/api/commands/types";
import { createStorage, wrapSync } from "@lib/api/storage";
import { messageUtil } from "@metro/common";
import { after } from "@lib/api/patcher";
import { findByName } from "@metro";

export { registerCommand, ApplicationCommandOptionType, after, findByName };

export async function loadStore<T extends object>(path: string, dflt: T): Promise<T> {
    const storage = createStorage<T>(path);
    await storage.get(); // ensure loaded
    return wrapSync(storage) as T;
}

/** Show a message only you can see (Clyde-style), falling back to nothing if unavailable. */
export function sendLocal(channelId: string, content: string) {
    try {
        messageUtil.sendBotMessage(channelId, content);
        return true;
    } catch {
        return false;
    }
}
