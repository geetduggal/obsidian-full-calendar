import { Notice, WorkspaceLeaf, TFile } from "obsidian";
import * as React from "react";
import { EditableCalendar } from "src/calendars/EditableCalendar";
import FullCalendarPlugin from "src/main";
import { OFCEvent } from "src/types";
import { openFileForEvent } from "./actions";
import { EditEvent } from "./components/EditEvent";
import ReactModal from "./ReactModal";

// Simple title input component
const TitleInputDialog = ({
    onSubmit,
    defaultTitle = "",
}: {
    onSubmit: (title: string, shouldOpen: boolean) => void;
    defaultTitle?: string;
}) => {
    const [title, setTitle] = React.useState(defaultTitle);
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        inputRef.current?.focus();
    }, []);

    return (
        <div style={{ padding: "20px" }}>
            <h3 style={{ marginTop: 0 }}>Create Event</h3>
            <input
                ref={inputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        onSubmit(title || "Untitled Event", false);
                    } else if (e.key === "Escape") {
                        e.preventDefault();
                        onSubmit("", false);
                    }
                }}
                placeholder="Event title..."
                style={{
                    width: "100%",
                    padding: "8px",
                    marginBottom: "16px",
                    fontSize: "1em",
                }}
            />
            <div
                style={{
                    display: "flex",
                    gap: "8px",
                    justifyContent: "flex-end",
                }}
            >
                <button
                    onClick={() => onSubmit(title || "Untitled Event", false)}
                    style={{
                        padding: "8px 16px",
                        backgroundColor: "var(--interactive-normal)",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                    }}
                >
                    Create
                </button>
                <button
                    onClick={() => onSubmit(title || "Untitled Event", true)}
                    style={{
                        padding: "8px 16px",
                        backgroundColor: "var(--interactive-accent)",
                        color: "var(--text-on-accent)",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                    }}
                >
                    Open File
                </button>
            </div>
        </div>
    );
};

async function createAndOpenEventFile(
    plugin: FullCalendarPlugin,
    partialEvent: Partial<OFCEvent>
) {
    const calendars = [...plugin.cache.calendars.entries()]
        .filter(([_, cal]) => cal instanceof EditableCalendar)
        .map(([id, cal]) => ({ id, type: cal.type, name: cal.name }));

    if (calendars.length === 0) {
        new Notice("No editable calendars found");
        return;
    }

    // Show title input dialog
    new ReactModal(plugin.app, async (closeModal) =>
        React.createElement(TitleInputDialog, {
            defaultTitle: partialEvent.title || "",
            onSubmit: async (title: string, shouldOpen: boolean) => {
                closeModal();

                if (!title) {
                    return; // User cancelled
                }

                // Auto-fill from active LinearView filter if present
                const activeFilter = (window as any).linearViewActiveFilter;
                if (
                    activeFilter &&
                    activeFilter.type &&
                    activeFilter.values &&
                    activeFilter.values.length > 0
                ) {
                    const latestFilterValue =
                        activeFilter.values[activeFilter.values.length - 1];
                    (partialEvent as any)[activeFilter.type] =
                        latestFilterValue;
                }

                // Get the default calendar
                const defaultCalendarIndex = Math.min(
                    plugin.settings.defaultCalendar,
                    calendars.length - 1
                );
                const calendarId = calendars[defaultCalendarIndex].id;

                // Create event with the provided title
                const eventData: OFCEvent = {
                    title,
                    type: partialEvent.type || "single",
                    allDay: partialEvent.allDay ?? true,
                    date:
                        partialEvent.date ||
                        new Date().toISOString().split("T")[0],
                    ...partialEvent,
                } as OFCEvent;

                try {
                    const success = await plugin.cache.addEvent(
                        calendarId,
                        eventData
                    );
                    if (!success) {
                        new Notice("Failed to create event");
                        return;
                    }

                    if (shouldOpen) {
                        // Find the newly created event and open it
                        await new Promise((resolve) =>
                            setTimeout(resolve, 100)
                        );

                        const allEvents = plugin.cache.getAllEvents();
                        for (const source of allEvents) {
                            for (const cachedEvent of source.events) {
                                const event = cachedEvent.event;
                                if (
                                    event.title === eventData.title &&
                                    (event.type === "single"
                                        ? event.date === eventData.date
                                        : true)
                                ) {
                                    // Open in a new split pane
                                    const details =
                                        plugin.cache.getInfoForEditableEvent(
                                            cachedEvent.id
                                        );
                                    if (details) {
                                        const file =
                                            plugin.app.vault.getAbstractFileByPath(
                                                details.location.path
                                            );
                                        if (file instanceof TFile) {
                                            const leaf =
                                                plugin.app.workspace.getLeaf(
                                                    "split"
                                                );
                                            await leaf.openFile(file);
                                        }
                                    }
                                    return;
                                }
                            }
                        }
                    }
                } catch (e) {
                    if (e instanceof Error) {
                        new Notice("Error creating event: " + e.message);
                        console.error(e);
                    }
                }
            },
        })
    ).open();
}

export function launchCreateModal(
    plugin: FullCalendarPlugin,
    partialEvent: Partial<OFCEvent>
) {
    // Check if we should open file directly instead of modal
    if (plugin.settings.openFileInsteadOfModal) {
        createAndOpenEventFile(plugin, partialEvent);
        return;
    }

    const calendars = [...plugin.cache.calendars.entries()]
        .filter(([_, cal]) => cal instanceof EditableCalendar)
        .map(([id, cal]) => {
            return {
                id,
                type: cal.type,
                name: cal.name,
            };
        });

    // Collect all property keys and values for autocomplete
    const allEventSources = plugin.cache.getAllEvents();
    const propertyKeys = new Set<string>();
    const propertyValues = new Map<string, Set<string>>();

    allEventSources.forEach((source) => {
        source.events.forEach((cachedEvent) => {
            const eventData = cachedEvent.event as any;
            for (const [key, value] of Object.entries(eventData)) {
                // Skip standard event fields
                if (
                    [
                        "title",
                        "id",
                        "type",
                        "date",
                        "endDate",
                        "allDay",
                        "startTime",
                        "endTime",
                        "daysOfWeek",
                        "startRecur",
                        "endRecur",
                        "completed",
                        "startDate",
                        "rrule",
                        "skipDates",
                    ].includes(key)
                ) {
                    continue;
                }
                if (value && typeof value === "string") {
                    propertyKeys.add(key);
                    if (!propertyValues.has(key)) {
                        propertyValues.set(key, new Set());
                    }
                    propertyValues.get(key)!.add(value);
                }
            }
        });
    });

    // Get all markdown files for wiki-link autocomplete
    const allFiles = plugin.app.vault
        .getMarkdownFiles()
        .map((file) => file.basename);

    // Auto-fill from active LinearView filter if present
    const activeFilter = (window as any).linearViewActiveFilter;
    if (
        activeFilter &&
        activeFilter.type &&
        activeFilter.values &&
        activeFilter.values.length > 0
    ) {
        // Use the most recently added filter value (last in array)
        const latestFilterValue =
            activeFilter.values[activeFilter.values.length - 1];
        // Set the property dynamically based on filter type
        (partialEvent as any)[activeFilter.type] = latestFilterValue;
    }

    new ReactModal(plugin.app, async (closeModal) =>
        React.createElement(EditEvent, {
            initialEvent: partialEvent,
            calendars,
            defaultCalendarIndex: 0,
            allPropertyKeys: Array.from(propertyKeys).sort(),
            allPropertyValues: new Map(
                Array.from(propertyValues.entries()).map(([k, v]) => [
                    k,
                    Array.from(v).sort(),
                ])
            ),
            allFiles: allFiles.sort(),
            submit: async (data, calendarIndex) => {
                const calendarId = calendars[calendarIndex].id;
                try {
                    await plugin.cache.addEvent(calendarId, data);
                } catch (e) {
                    if (e instanceof Error) {
                        new Notice("Error when creating event: " + e.message);
                        console.error(e);
                    }
                }
                closeModal();
            },
        })
    ).open();
}

export function launchEditModal(plugin: FullCalendarPlugin, eventId: string) {
    // Check if we should open file directly instead of modal
    if (plugin.settings.openFileInsteadOfModal) {
        openFileForEvent(
            plugin.cache,
            {
                workspace: plugin.app.workspace,
                vault: plugin.app.vault,
            },
            eventId
        );
        return;
    }

    const eventToEdit = plugin.cache.getEventById(eventId);
    if (!eventToEdit) {
        throw new Error("Cannot edit event that doesn't exist.");
    }
    const calId = plugin.cache.getInfoForEditableEvent(eventId).calendar.id;

    const calendars = [...plugin.cache.calendars.entries()]
        .filter(([_, cal]) => cal instanceof EditableCalendar)
        .map(([id, cal]) => {
            return {
                id,
                type: cal.type,
                name: cal.name,
            };
        });

    const calIdx = calendars.findIndex(({ id }) => id === calId);

    // Collect all property keys and values for autocomplete
    const allEventSources = plugin.cache.getAllEvents();
    const propertyKeys = new Set<string>();
    const propertyValues = new Map<string, Set<string>>();

    allEventSources.forEach((source) => {
        source.events.forEach((cachedEvent) => {
            const eventData = cachedEvent.event as any;
            for (const [key, value] of Object.entries(eventData)) {
                // Skip standard event fields
                if (
                    [
                        "title",
                        "id",
                        "type",
                        "date",
                        "endDate",
                        "allDay",
                        "startTime",
                        "endTime",
                        "daysOfWeek",
                        "startRecur",
                        "endRecur",
                        "completed",
                        "startDate",
                        "rrule",
                        "skipDates",
                    ].includes(key)
                ) {
                    continue;
                }
                if (value && typeof value === "string") {
                    propertyKeys.add(key);
                    if (!propertyValues.has(key)) {
                        propertyValues.set(key, new Set());
                    }
                    propertyValues.get(key)!.add(value);
                }
            }
        });
    });

    // Get all markdown files for wiki-link autocomplete
    const allFiles = plugin.app.vault
        .getMarkdownFiles()
        .map((file) => file.basename);

    new ReactModal(plugin.app, async (closeModal) =>
        React.createElement(EditEvent, {
            initialEvent: eventToEdit,
            calendars,
            defaultCalendarIndex: calIdx,
            allPropertyKeys: Array.from(propertyKeys).sort(),
            allPropertyValues: new Map(
                Array.from(propertyValues.entries()).map(([k, v]) => [
                    k,
                    Array.from(v).sort(),
                ])
            ),
            allFiles: allFiles.sort(),
            submit: async (data, calendarIndex) => {
                try {
                    if (calendarIndex !== calIdx) {
                        await plugin.cache.moveEventToCalendar(
                            eventId,
                            calendars[calendarIndex].id
                        );
                    }
                    await plugin.cache.updateEventWithId(eventId, data);
                } catch (e) {
                    if (e instanceof Error) {
                        new Notice("Error when updating event: " + e.message);
                        console.error(e);
                    }
                }
                closeModal();
            },
            open: async () => {
                openFileForEvent(plugin.cache, plugin.app, eventId);
            },
            deleteEvent: async () => {
                try {
                    await plugin.cache.deleteEvent(eventId);
                    closeModal();
                } catch (e) {
                    if (e instanceof Error) {
                        new Notice("Error when deleting event: " + e.message);
                        console.error(e);
                    }
                }
            },
        })
    ).open();
}
