import { MarkdownView, TFile, Vault, Workspace } from "obsidian";
import EventCache from "src/core/EventCache";

/**
 * Open a file in the editor to a given event.
 * @param cache
 * @param param1 App
 * @param id event ID
 * @returns
 */
export async function openFileForEvent(
    cache: EventCache,
    { workspace, vault }: { workspace: Workspace; vault: Vault },
    id: string,
    openInSplit: boolean = false
) {
    const details = cache.getInfoForEditableEvent(id);
    if (!details) {
        throw new Error("Event does not have local representation.");
    }
    const {
        location: { path, lineNumber },
    } = details;
    let leaf;
    if (openInSplit) {
        // Open in a new split to the right
        leaf = workspace.getLeaf("split", "vertical");
    } else {
        leaf = workspace.getMostRecentLeaf();
        if (!leaf) {
            return;
        }
        if (leaf.getViewState().pinned) {
            leaf = workspace.getLeaf("tab");
        }
    }
    const file = vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
        return;
    }
    await leaf.openFile(file);
    if (lineNumber && leaf.view instanceof MarkdownView) {
        leaf.view.editor.setCursor({ line: lineNumber, ch: 0 });
    }
}
