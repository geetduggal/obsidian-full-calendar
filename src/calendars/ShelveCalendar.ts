import { TFile, TFolder } from "obsidian";
import { EventPathLocation } from "../core/EventStore";
import { ObsidianInterface } from "../ObsidianAdapter";
import { OFCEvent, EventLocation, validateEvent } from "../types";
import { EditableCalendar, EditableEventResponse } from "./EditableCalendar";
import { modifyFrontmatterString } from "./FullNoteCalendar";

export default class ShelveCalendar extends EditableCalendar {
    app: ObsidianInterface;
    private _value: string;

    constructor(app: ObsidianInterface, color: string, value: string) {
        super(color);
        this.app = app;
        this._value = value;
    }

    get value(): string {
        return this._value;
    }

    get directory(): string {
        return "/"; // Shelve calendars scan the entire vault
    }

    get type(): "shelve" {
        return "shelve";
    }

    get identifier(): string {
        return `shelve:${this.value}`;
    }

    get name(): string {
        return `Shelve: ${this.value}`;
    }

    containsPath(path: string): boolean {
        // Check if the file at this path has the matching shelve property
        const file = this.app.getFileByPath(path);
        if (!file) return false;

        const metadata = this.app.getMetadata(file);
        return metadata?.frontmatter?.shelve === this.value;
    }

    async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
        const metadata = this.app.getMetadata(file);
        const frontmatter = metadata?.frontmatter;

        // Only include events with matching shelve property
        if (frontmatter?.shelve !== this.value) {
            return [];
        }

        let event = validateEvent(frontmatter);
        if (!event) {
            return [];
        }
        if (!event.title) {
            event.title = file.basename;
        }
        return [[event, { file, lineNumber: undefined }]];
    }

    private async getEventsInFolderRecursive(
        folder: TFolder
    ): Promise<EditableEventResponse[]> {
        const events = await Promise.all(
            folder.children.map(async (file) => {
                if (file instanceof TFile && file.extension === "md") {
                    return await this.getEventsInFile(file);
                } else if (file instanceof TFolder) {
                    return await this.getEventsInFolderRecursive(file);
                } else {
                    return [];
                }
            })
        );
        return events.flat();
    }

    async getEvents(): Promise<EditableEventResponse[]> {
        const rootFolder = this.app.getAbstractFileByPath("/");
        if (!rootFolder || !(rootFolder instanceof TFolder)) {
            throw new Error("Cannot access vault root");
        }
        return await this.getEventsInFolderRecursive(rootFolder);
    }

    async createEvent(event: OFCEvent): Promise<EventLocation> {
        throw new Error(
            "Shelve calendar does not support creating events directly. Events must be created with the shelve property."
        );
    }

    getNewLocation(
        location: EventPathLocation,
        event: OFCEvent
    ): EventLocation {
        const { path, lineNumber } = location;
        if (lineNumber !== undefined) {
            throw new Error("Shelve calendar cannot handle inline events.");
        }
        // Location doesn't change, just the frontmatter
        return { file: { path }, lineNumber: undefined };
    }

    async modifyEvent(
        location: EventPathLocation,
        event: OFCEvent,
        updateCacheWithLocation: (loc: EventLocation) => void
    ): Promise<void> {
        const { path } = location;
        const file = this.app.getFileByPath(path);
        if (!file) {
            throw new Error(
                `File ${path} either doesn't exist or is a folder.`
            );
        }

        await this.app.rewrite(file, (page) =>
            modifyFrontmatterString(page, event)
        );

        updateCacheWithLocation({ file, lineNumber: undefined });
    }

    async move(
        fromLocation: EventPathLocation,
        toCalendar: EditableCalendar,
        updateCacheWithLocation: (loc: EventLocation) => void
    ): Promise<void> {
        throw new Error(
            "Moving events between shelve calendars is not supported."
        );
    }

    deleteEvent({ path, lineNumber }: EventPathLocation): Promise<void> {
        if (lineNumber !== undefined) {
            throw new Error("Shelve calendar cannot handle inline events.");
        }
        const file = this.app.getFileByPath(path);
        if (!file) {
            throw new Error(`File ${path} not found.`);
        }
        return this.app.delete(file);
    }
}
