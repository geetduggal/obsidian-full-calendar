import { Notice } from "obsidian";
import * as React from "react";
import { EditableCalendar } from "src/calendars/EditableCalendar";
import FullCalendarPlugin from "src/main";
import { OFCEvent } from "src/types";
import { openFileForEvent } from "./actions";
import { EditEvent } from "./components/EditEvent";
import ReactModal from "./ReactModal";

export function launchCreateModal(
    plugin: FullCalendarPlugin,
    partialEvent: Partial<OFCEvent>
) {
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
