import { EventApi, EventInput } from "@fullcalendar/core";
import { OFCEvent } from "../types";

import { DateTime, Duration } from "luxon";
import { rrulestr } from "rrule";

/*
 * Functions for converting between the types used by the FullCalendar view plugin and types used internally by Obsidian Full Calendar.
 */

const parseTime = (time: string): Duration | null => {
    let parsed = DateTime.fromFormat(time, "h:mm a");
    if (parsed.invalidReason) {
        parsed = DateTime.fromFormat(time, "HH:mm");
    }
    if (parsed.invalidReason) {
        parsed = DateTime.fromFormat(time, "HH:mm:ss");
    }

    if (parsed.invalidReason) {
        console.error(
            `FC: Error parsing time string '${time}': ${parsed.invalidReason}'`
        );
        return null;
    }

    return Duration.fromISOTime(
        parsed.toISOTime({
            includeOffset: false,
            includePrefix: false,
        })
    );
};

const normalizeTimeString = (time: string): string | null => {
    const parsed = parseTime(time);
    if (!parsed) {
        return null;
    }
    return parsed.toISOTime({
        suppressMilliseconds: true,
        includePrefix: false,
        suppressSeconds: true,
    });
};

const add = (date: DateTime, time: Duration): DateTime => {
    let hours = time.hours;
    let minutes = time.minutes;
    return date.set({ hour: hours, minute: minutes });
};

const getTime = (date: Date): string =>
    DateTime.fromJSDate(date).toISOTime({
        suppressMilliseconds: true,
        includeOffset: false,
        suppressSeconds: true,
    });

const getDate = (date: Date): string => DateTime.fromJSDate(date).toISODate();

const combineDateTimeStrings = (date: string, time: string): string | null => {
    const parsedDate = DateTime.fromISO(date);
    if (parsedDate.invalidReason) {
        console.error(
            `FC: Error parsing time string '${date}': ${parsedDate.invalidReason}`
        );
        return null;
    }

    const parsedTime = parseTime(time);
    if (!parsedTime) {
        return null;
    }

    return add(parsedDate, parsedTime).toISO({
        includeOffset: false,
        suppressMilliseconds: true,
    });
};

const DAYS = "UMTWRFS";

// Color palette matching light pastels for all views
const PROPERTY_COLORS = [
    "#c5e1a5", // Light green
    "#64b5f6", // Light blue
    "#fff59d", // Light yellow
    "#ffab91", // Light orange/coral
    "#ce93d8", // Light purple
    "#80deea", // Light cyan
    "#f48fb1", // Light pink
    "#a5d6a7", // Light mint
    "#90caf9", // Sky blue
    "#ffcc80", // Peach
    "#b39ddb", // Lavender
    "#81c784", // Green
];

// Hash function to consistently map property values to colors
function hashStringToColor(str: string): string {
    if (!str) return "#e0e0e0";
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return PROPERTY_COLORS[Math.abs(hash) % PROPERTY_COLORS.length];
}

// Helper to normalize property value (remove quotes and extract from wiki links)
function normalizeValue(value: string | null): string | null {
    if (!value) return null;
    let cleaned = value.replace(/^['"]|['"]$/g, "");
    const match = cleaned.match(/\[\[([^\]]+)\]\]/);
    return match ? match[1] : cleaned;
}

// Extract custom properties (anything beyond standard OFCEvent fields)
function getCustomProperties(frontmatter: OFCEvent): Record<string, any> {
    const standardFields = new Set([
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
    ]);
    const custom: Record<string, any> = {};
    for (const [key, value] of Object.entries(frontmatter)) {
        if (
            !standardFields.has(key) &&
            value !== undefined &&
            value !== null &&
            value !== ""
        ) {
            custom[key] = value;
        }
    }
    return custom;
}

// Get color for event based on custom properties
function getEventColor(frontmatter: OFCEvent): {
    backgroundColor?: string;
    borderColor?: string;
    textColor?: string;
} {
    const customProps = getCustomProperties(frontmatter);

    // Find first non-empty property value to use for coloring
    // Priority: folder > box > shelve > any other property
    const propertyPriority = ["folder", "box", "shelve"];
    let colorProperty = null;

    for (const key of propertyPriority) {
        if (customProps[key]) {
            colorProperty = normalizeValue(customProps[key] as string);
            break;
        }
    }

    // If no priority property, use first available custom property
    if (!colorProperty) {
        for (const [key, value] of Object.entries(customProps)) {
            if (value && key !== "isTask" && key !== "taskCompleted") {
                colorProperty = normalizeValue(value as string);
                break;
            }
        }
    }

    if (colorProperty) {
        const color = hashStringToColor(colorProperty);
        return {
            backgroundColor: color,
            borderColor: color,
            textColor: "#1a1a1a",
        };
    }

    return {};
}

export function dateEndpointsToFrontmatter(
    start: Date,
    end: Date,
    allDay: boolean
): Partial<OFCEvent> {
    const date = getDate(start);
    const endDate = getDate(end);
    return {
        type: "single",
        date,
        endDate: date !== endDate ? endDate : undefined,
        allDay,
        ...(allDay
            ? {}
            : {
                  startTime: getTime(start),
                  endTime: getTime(end),
              }),
    };
}

export function toEventInput(
    id: string,
    frontmatter: OFCEvent
): EventInput | null {
    const colors = getEventColor(frontmatter);
    let event: EventInput = {
        id,
        title: frontmatter.title,
        allDay: frontmatter.allDay,
        ...colors,
    };
    if (frontmatter.type === "recurring") {
        event = {
            ...event,
            daysOfWeek: frontmatter.daysOfWeek.map((c) => DAYS.indexOf(c)),
            startRecur: frontmatter.startRecur,
            endRecur: frontmatter.endRecur,
            extendedProps: {
                isTask: false,
                ...getCustomProperties(frontmatter),
            },
        };
        if (!frontmatter.allDay) {
            event = {
                ...event,
                startTime: normalizeTimeString(frontmatter.startTime || ""),
                endTime: frontmatter.endTime
                    ? normalizeTimeString(frontmatter.endTime)
                    : undefined,
            };
        }
    } else if (frontmatter.type === "rrule") {
        const dtstart = (() => {
            if (frontmatter.allDay) {
                return DateTime.fromISO(frontmatter.startDate);
            } else {
                const dtstartStr = combineDateTimeStrings(
                    frontmatter.startDate,
                    frontmatter.startTime
                );

                if (!dtstartStr) {
                    return null;
                }
                return DateTime.fromISO(dtstartStr);
            }
        })();
        if (dtstart === null) {
            return null;
        }
        // NOTE: how exdates are handled does not support events which recur more than once per day.
        const exdate = frontmatter.skipDates
            .map((d) => {
                // Can't do date arithmetic because timezone might change for different exdates due to DST.
                // RRule only has one dtstart that doesn't know about DST/timezone changes.
                // Therefore, just concatenate the date for this exdate and the start time for the event together.
                const date = DateTime.fromISO(d).toISODate();
                const time = dtstart.toJSDate().toISOString().split("T")[1];

                return `${date}T${time}`;
            })
            .flatMap((d) => (d ? d : []));

        event = {
            id,
            title: frontmatter.title,
            allDay: frontmatter.allDay,
            rrule: rrulestr(frontmatter.rrule, {
                dtstart: dtstart.toJSDate(),
            }).toString(),
            exdate,
        };

        if (!frontmatter.allDay) {
            const startTime = parseTime(frontmatter.startTime);
            if (startTime && frontmatter.endTime) {
                const endTime = parseTime(frontmatter.endTime);
                const duration = endTime?.minus(startTime);
                if (duration) {
                    event.duration = duration.toISOTime({
                        includePrefix: false,
                        suppressMilliseconds: true,
                        suppressSeconds: true,
                    });
                }
            }
        }
    } else if (frontmatter.type === "single") {
        if (!frontmatter.allDay) {
            const start = combineDateTimeStrings(
                frontmatter.date,
                frontmatter.startTime
            );
            if (!start) {
                return null;
            }
            let end = undefined;
            if (frontmatter.endTime) {
                end = combineDateTimeStrings(
                    frontmatter.endDate || frontmatter.date,
                    frontmatter.endTime
                );
                if (!end) {
                    return null;
                }
            }

            event = {
                ...event,
                start,
                end,
                extendedProps: {
                    isTask:
                        frontmatter.completed !== undefined &&
                        frontmatter.completed !== null,
                    taskCompleted: frontmatter.completed,
                    ...getCustomProperties(frontmatter),
                },
            };
        } else {
            event = {
                ...event,
                start: frontmatter.date,
                end: frontmatter.endDate || undefined,
                extendedProps: {
                    isTask:
                        frontmatter.completed !== undefined &&
                        frontmatter.completed !== null,
                    taskCompleted: frontmatter.completed,
                    ...getCustomProperties(frontmatter),
                },
            };
        }
    }

    return event;
}

export function fromEventApi(event: EventApi): OFCEvent {
    const isRecurring: boolean = event.extendedProps.daysOfWeek !== undefined;
    const startDate = getDate(event.start as Date);
    const endDate = getDate(event.end as Date);
    return {
        title: event.title,
        ...(event.allDay
            ? { allDay: true }
            : {
                  allDay: false,
                  startTime: getTime(event.start as Date),
                  endTime: getTime(event.end as Date),
              }),

        ...(isRecurring
            ? {
                  type: "recurring",
                  daysOfWeek: event.extendedProps.daysOfWeek.map(
                      (i: number) => DAYS[i]
                  ),
                  startRecur:
                      event.extendedProps.startRecur &&
                      getDate(event.extendedProps.startRecur),
                  endRecur:
                      event.extendedProps.endRecur &&
                      getDate(event.extendedProps.endRecur),
              }
            : {
                  type: "single",
                  date: startDate,
                  ...(startDate !== endDate ? { endDate } : { endDate: null }),
                  completed: event.extendedProps.taskCompleted,
              }),
    };
}
