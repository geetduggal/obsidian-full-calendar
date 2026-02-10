import * as React from "react";
import { flushSync } from "react-dom";
import { DateTime } from "luxon";
import { sliceEvents } from "@fullcalendar/core";
import { LinearMonth } from "./LinearMonth";
import "./linear.css";

// Color palette for folders (vibrant colors for year view - white text works well)
const FOLDER_COLORS = [
    "#e53935", // Vibrant red
    "#d81b60", // Vibrant pink
    "#8e24aa", // Vibrant purple
    "#5e35b1", // Vibrant indigo
    "#1e88e5", // Vibrant blue
    "#00acc1", // Vibrant cyan
    "#00897b", // Vibrant teal
    "#43a047", // Vibrant green
    "#7cb342", // Vibrant lime
    "#fdd835", // Vibrant yellow
    "#fb8c00", // Vibrant orange
    "#f4511e", // Vibrant deep orange
];

// Hash function to consistently map folder names to colors
function hashStringToColor(str: string): string {
    if (!str) return "#e0e0e0"; // Default gray for no folder
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return FOLDER_COLORS[Math.abs(hash) % FOLDER_COLORS.length];
}

interface LinearViewState {
    draggedEventId: string | null;
    draggedEventOriginalDate: DateTime | null;
    dragOverDate: DateTime | null;
    selectionStart: DateTime | null;
    selectionCurrent: DateTime | null;
    isSelecting: boolean;
    dragPreview: {
        eventId: string;
        title: string;
        color: string;
        textColor: string;
        targetDate: DateTime;
        sourceDate: DateTime;
    } | null;
    folderFilters: string[]; // Multiple filters with OR logic
    filterSearchText: string;
    showFolderDropdown: boolean;
}

interface OptimisticTransform {
    eventId: string;
    pixelOffset: number;
}

export class LinearView extends React.Component<any, LinearViewState> {
    private cachedEvents: any[] | null = null;
    private lastEventCount: number = 0;
    private lastRenderKey: string = "";
    private lastDateProfileKey: string = "";
    private filterInputRef: React.RefObject<HTMLInputElement> =
        React.createRef();
    private recentlyUpdatedEvents: Set<string> = new Set(); // Track events we just updated

    constructor(props: any) {
        super(props);
        this.state = {
            draggedEventId: null,
            draggedEventOriginalDate: null,
            dragOverDate: null,
            selectionStart: null,
            selectionCurrent: null,
            isSelecting: false,
            dragPreview: null,
            folderFilters: [],
            filterSearchText: "",
            showFolderDropdown: false,
        };
    }

    // Helper to normalize folder value (remove quotes and extract from wiki links if needed)
    private normalizeFolder(folder: string | null): string | null {
        if (!folder) return null;
        // Remove surrounding quotes if present
        let cleaned = folder.replace(/^['"]|['"]$/g, "");
        // Extract from [[Filename]] format if present
        const match = cleaned.match(/\[\[([^\]]+)\]\]/);
        return match ? match[1] : cleaned;
    }

    // Get all unique folder values from events
    private getUniqueFolders(): string[] {
        if (!this.cachedEvents) {
            return [];
        }

        const folders = new Set<string>();
        this.cachedEvents.forEach((event) => {
            const normalized = this.normalizeFolder(event.folder);
            if (normalized) folders.add(normalized);
        });

        return Array.from(folders).sort();
    }

    // Removed shouldComponentUpdate to allow React to handle all updates
    // This ensures external file changes trigger re-renders properly

    render() {
        const { dateProfile } = this.props;

        // Use the year from the date range
        // For year navigation, we need to use the range that FullCalendar is actually showing
        const rangeStart = DateTime.fromJSDate(dateProfile.currentRange.start);
        const rangeEnd = DateTime.fromJSDate(dateProfile.currentRange.end);

        // Use the year that contains the majority of the range (the midpoint)
        const midpoint = rangeStart.plus({
            milliseconds: rangeEnd.diff(rangeStart).milliseconds / 2,
        });
        const currentYear = midpoint.year;

        // Always start from January 1st of the year being viewed
        const yearStart = DateTime.fromObject({
            year: currentYear,
            month: 1,
            day: 1,
        });

        // Get all-day events only using FullCalendar's sliceEvents
        // The 'true' parameter tells sliceEvents to only return all-day events
        const allDaySegs = sliceEvents(this.props as any, true) || [];

        // Additional filter to ensure only allDay: true events
        const allSegs = allDaySegs.filter(
            (seg: any) => seg.def?.allDay === true
        );

        // Disable caching - always recompute events to avoid stale data
        // This ensures drag operations always show current positions
        this.cachedEvents = allSegs
            .map((seg: any) => {
                // Try to get the start date from different possible properties
                const startJS =
                    seg.start ||
                    seg.range?.start ||
                    seg.def?.recurringDef?.typeData?.startTime;
                const endJS =
                    seg.end ||
                    seg.range?.end ||
                    seg.def?.recurringDef?.typeData?.endTime;

                if (!startJS) {
                    console.warn(`No start date for "${seg.def.title}"`);
                    return null;
                }

                // Get ISO date string directly from the Date object to avoid timezone issues
                // For all-day events, we only care about the date part, not the time
                const startDateStr = startJS.toISOString().split("T")[0];
                const endDateStr = endJS
                    ? endJS.toISOString().split("T")[0]
                    : null;

                const startDate = DateTime.fromISO(startDateStr);
                const endDate = endDateStr
                    ? DateTime.fromISO(endDateStr)
                    : startDate.plus({ days: 1 });

                if (!startDate.isValid) {
                    console.warn(
                        `Invalid start date for "${seg.def.title}":`,
                        startJS
                    );
                    return null;
                }

                // Get folder from extended props and derive color
                const folder = seg.def.extendedProps?.folder || null;
                const normalizedFolder = this.normalizeFolder(folder);

                const folderColor = normalizedFolder
                    ? hashStringToColor(normalizedFolder)
                    : null;
                const eventColor =
                    folderColor ||
                    seg.def.ui.backgroundColor ||
                    seg.ui.backgroundColor ||
                    "#3788d8";
                // Use white text for folder-colored events (vibrant colors), otherwise use event's default
                const textColor = folderColor
                    ? "#ffffff"
                    : seg.def.ui.textColor || seg.ui.textColor || "#000";

                return {
                    id: seg.def.publicId,
                    title: seg.def.title,
                    color: eventColor,
                    textColor: textColor,
                    start: startDate,
                    end: endDate,
                    isEditable: seg.def.ui.editable !== false,
                    folder: folder,
                };
            })
            .filter(
                (event): event is NonNullable<typeof event> => event !== null
            );

        // Use cached events (same reference) - optimistic offset will be applied in LinearMonth
        let events = this.cachedEvents!;

        // DEBUG: Log event IDs and positions
        const eventSummary = events
            .map((e) => `${e.id}@${e.start.toISODate()}`)
            .join(", ");
        console.log("🔵 LinearView events:", eventSummary);

        // Check for duplicates
        const ids = events.map((e) => e.id);
        const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
        if (duplicates.length > 0) {
            console.error("❌ DUPLICATE EVENT IDS:", duplicates);
        }

        // Get unique folder values for autocomplete
        const uniqueFolders = this.getUniqueFolders();

        // Filter folders based on search text
        const filteredFolders = this.state.filterSearchText
            ? uniqueFolders
                  .filter((folder) =>
                      folder
                          .toLowerCase()
                          .includes(this.state.filterSearchText.toLowerCase())
                  )
                  .slice(0, 20)
            : uniqueFolders.slice(0, 20);

        // Apply folder filters with OR logic
        if (this.state.folderFilters.length > 0) {
            events = events.filter((e) => {
                const eventFolder = this.normalizeFolder(e.folder);
                return (
                    eventFolder &&
                    this.state.folderFilters.includes(eventFolder)
                );
            });
        }

        // Generate 12 months
        const months = [];
        for (let i = 0; i < 12; i++) {
            months.push(yearStart.plus({ months: i }));
        }

        return (
            <div
                className="linear-year-view"
                onMouseUp={this.handleGlobalMouseUp}
                onMouseLeave={this.handleGlobalMouseUp}
            >
                {/* Folder filter */}
                <div
                    className="linear-filter-bar"
                    style={{
                        padding: "8px 12px",
                        marginBottom: "12px",
                        backgroundColor: "var(--background-secondary)",
                        borderRadius: "4px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            flexWrap: "wrap",
                        }}
                    >
                        <span
                            style={{
                                fontSize: "0.9em",
                                fontWeight: 600,
                                color: "var(--text-muted)",
                            }}
                        >
                            Filter by folder:
                        </span>
                        {/* Show selected filters as chips */}
                        {this.state.folderFilters.map((folder) => (
                            <div
                                key={folder}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    padding: "4px 8px",
                                    backgroundColor: hashStringToColor(folder),
                                    borderRadius: "12px",
                                    fontSize: "0.85em",
                                    color: "#000",
                                }}
                            >
                                <span>{folder}</span>
                                <button
                                    onClick={() => {
                                        this.setState({
                                            folderFilters:
                                                this.state.folderFilters.filter(
                                                    (f) => f !== folder
                                                ),
                                        });
                                    }}
                                    style={{
                                        border: "none",
                                        background: "none",
                                        cursor: "pointer",
                                        fontSize: "1.2em",
                                        color: "#000",
                                        padding: 0,
                                        lineHeight: "1",
                                        fontWeight: "bold",
                                    }}
                                    title={`Remove ${folder} filter`}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                        {this.state.folderFilters.length > 1 && (
                            <button
                                onClick={() =>
                                    this.setState({ folderFilters: [] })
                                }
                                style={{
                                    padding: "4px 8px",
                                    fontSize: "0.8em",
                                    border: "1px solid var(--background-modifier-border)",
                                    borderRadius: "4px",
                                    backgroundColor:
                                        "var(--background-primary)",
                                    color: "var(--text-muted)",
                                    cursor: "pointer",
                                }}
                            >
                                Clear all
                            </button>
                        )}
                        {this.state.folderFilters.length > 0 && (
                            <span
                                style={{
                                    fontSize: "0.85em",
                                    color: "var(--text-muted)",
                                }}
                            >
                                ({events.length} event
                                {events.length !== 1 ? "s" : ""})
                            </span>
                        )}
                    </div>
                    <div style={{ position: "relative", flex: "1" }}>
                        <input
                            ref={this.filterInputRef}
                            type="text"
                            placeholder="Type to add folder filter..."
                            value={this.state.filterSearchText}
                            onChange={(e) =>
                                this.setState({
                                    filterSearchText: e.target.value,
                                })
                            }
                            onFocus={() =>
                                this.setState({ showFolderDropdown: true })
                            }
                            onBlur={() =>
                                setTimeout(
                                    () =>
                                        this.setState({
                                            showFolderDropdown: false,
                                        }),
                                    200
                                )
                            }
                            onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                    this.setState({
                                        filterSearchText: "",
                                        showFolderDropdown: false,
                                    });
                                }
                            }}
                            style={{
                                width: "100%",
                                padding: "6px 8px",
                                fontSize: "0.9em",
                                border: "1px solid var(--background-modifier-border)",
                                borderRadius: "4px",
                                backgroundColor: "var(--background-primary)",
                                color: "var(--text-normal)",
                            }}
                        />
                        {this.state.showFolderDropdown &&
                            filteredFolders.length > 0 && (
                                <div
                                    style={{
                                        position: "absolute",
                                        top: "100%",
                                        left: 0,
                                        right: 0,
                                        marginTop: "4px",
                                        maxHeight: "250px",
                                        overflowY: "auto",
                                        backgroundColor:
                                            "var(--background-primary)",
                                        border: "1px solid var(--background-modifier-border)",
                                        borderRadius: "4px",
                                        boxShadow:
                                            "0 4px 12px rgba(0,0,0,0.15)",
                                        zIndex: 1000,
                                    }}
                                >
                                    {filteredFolders.map((folder) => {
                                        const eventCount =
                                            this.cachedEvents!.filter(
                                                (e) =>
                                                    this.normalizeFolder(
                                                        e.folder
                                                    ) === folder
                                            ).length;
                                        const isSelected =
                                            this.state.folderFilters.includes(
                                                folder
                                            );

                                        return (
                                            <div
                                                key={folder}
                                                onMouseDown={() => {
                                                    if (!isSelected) {
                                                        this.setState({
                                                            folderFilters: [
                                                                ...this.state
                                                                    .folderFilters,
                                                                folder,
                                                            ],
                                                            filterSearchText:
                                                                "",
                                                            showFolderDropdown:
                                                                false,
                                                        });
                                                    }
                                                }}
                                                style={{
                                                    padding: "8px 12px",
                                                    cursor: isSelected
                                                        ? "default"
                                                        : "pointer",
                                                    fontSize: "0.9em",
                                                    borderBottom:
                                                        "1px solid var(--background-modifier-border)",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent:
                                                        "space-between",
                                                    gap: "8px",
                                                    opacity: isSelected
                                                        ? 0.5
                                                        : 1,
                                                }}
                                                onMouseEnter={(e) =>
                                                    !isSelected &&
                                                    (e.currentTarget.style.backgroundColor =
                                                        "var(--background-modifier-hover)")
                                                }
                                                onMouseLeave={(e) =>
                                                    (e.currentTarget.style.backgroundColor =
                                                        "transparent")
                                                }
                                            >
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "8px",
                                                        flex: 1,
                                                        minWidth: 0,
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            width: "12px",
                                                            height: "12px",
                                                            borderRadius: "2px",
                                                            backgroundColor:
                                                                hashStringToColor(
                                                                    folder
                                                                ),
                                                            flexShrink: 0,
                                                        }}
                                                    />
                                                    <span
                                                        style={{
                                                            overflow: "hidden",
                                                            textOverflow:
                                                                "ellipsis",
                                                            whiteSpace:
                                                                "nowrap",
                                                        }}
                                                    >
                                                        {folder}
                                                    </span>
                                                    {isSelected && (
                                                        <span
                                                            style={{
                                                                fontSize:
                                                                    "0.8em",
                                                                color: "var(--text-muted)",
                                                            }}
                                                        >
                                                            ✓
                                                        </span>
                                                    )}
                                                </div>
                                                {eventCount > 0 && (
                                                    <span
                                                        style={{
                                                            fontSize: "0.85em",
                                                            color: "var(--text-muted)",
                                                            backgroundColor:
                                                                "var(--background-modifier-border)",
                                                            padding: "1px 6px",
                                                            borderRadius: "8px",
                                                            flexShrink: 0,
                                                        }}
                                                    >
                                                        {eventCount}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                    </div>
                </div>
                <div
                    className="linear-header"
                    style={{
                        display: "grid",
                        gridTemplateColumns: "50px 1fr",
                        marginBottom: "10px",
                    }}
                >
                    <div className="linear-header-spacer"></div>
                    <div
                        className="linear-header-days"
                        style={{ display: "flex", minWidth: "100%", gap: 0 }}
                    >
                        {/* Show 37 day headers: 5 full weeks + 2 days */}
                        {[
                            "Su",
                            "Mo",
                            "Tu",
                            "We",
                            "Th",
                            "Fr",
                            "Sa",
                            "Su",
                            "Mo",
                            "Tu",
                            "We",
                            "Th",
                            "Fr",
                            "Sa",
                            "Su",
                            "Mo",
                            "Tu",
                            "We",
                            "Th",
                            "Fr",
                            "Sa",
                            "Su",
                            "Mo",
                            "Tu",
                            "We",
                            "Th",
                            "Fr",
                            "Sa",
                            "Su",
                            "Mo",
                            "Tu",
                            "We",
                            "Th",
                            "Fr",
                            "Sa",
                            "Su",
                            "Mo",
                        ].map((day, index) => (
                            <span
                                key={index}
                                className="linear-header-day"
                                style={{
                                    flex: "1 0 36px",
                                    minWidth: "36px",
                                    textAlign: "center",
                                    fontSize: "0.75em",
                                    fontWeight: 600,
                                    padding: "4px 0",
                                }}
                            >
                                {day}
                            </span>
                        ))}
                    </div>
                </div>
                {months.map((month) => (
                    <LinearMonth
                        key={month.toISODate()}
                        month={month}
                        events={events}
                        onDayClick={this.handleDayClick}
                        onEventClick={this.handleEventClick}
                        onDragStart={this.handleDragStart}
                        onDragOver={this.handleDragOver}
                        onDrop={this.handleDrop}
                        onSelectionStart={this.handleSelectionStart}
                        onSelectionMove={this.handleSelectionMove}
                        onSelectionEnd={this.handleSelectionEnd}
                        dragOverDate={this.state.dragOverDate}
                        selectionStart={this.state.selectionStart}
                        selectionCurrent={this.state.selectionCurrent}
                        isSelecting={this.state.isSelecting}
                    />
                ))}
            </div>
        );
    }

    handleEventClick = (eventId: string, e: React.MouseEvent) => {
        const calendar = (window as any).fc;
        if (!calendar) {
            console.error("No calendar instance found");
            return;
        }

        const event = calendar.getEventById(eventId);
        if (!event) {
            console.error(`Event ${eventId} not found`);
            return;
        }

        const eventClickHandler = calendar.getOption("eventClick");
        if (eventClickHandler) {
            try {
                eventClickHandler({
                    event,
                    jsEvent: e.nativeEvent,
                    el: e.target as HTMLElement,
                    view: calendar.view,
                });
            } catch (error) {
                console.error("Error calling eventClick:", error);
            }
        }
    };

    handleDragStart = (eventId: string, date: DateTime, e: React.DragEvent) => {
        console.log("🔷 handleDragStart:", eventId, date.toISODate());

        // Find the event details for the preview
        const event = this.cachedEvents?.find((ev) => ev.id === eventId);
        if (event) {
            this.setState({
                draggedEventId: eventId,
                draggedEventOriginalDate: date,
                dragPreview: {
                    eventId,
                    title: event.title,
                    color: event.color,
                    textColor: event.textColor,
                    targetDate: date,
                    sourceDate: date,
                },
            });
        } else {
            this.setState({
                draggedEventId: eventId,
                draggedEventOriginalDate: date,
            });
        }

        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", eventId);
        }
    };

    handleDragOver = (date: DateTime, e: React.DragEvent) => {
        // Don't update state during drag - this prevents constant re-renders
        // The browser's native drag preview will show feedback
        // We'll update React state once on drop for instant final positioning
    };

    handleDrop = async (date: DateTime, e: React.DragEvent) => {
        console.log("🔷 handleDrop called:", date.toISODate());
        const { draggedEventId, draggedEventOriginalDate } = this.state;

        if (!draggedEventId || !draggedEventOriginalDate) {
            console.log("🔷 No dragged event or original date");
            return;
        }

        const daysDiff = Math.round(
            date.diff(draggedEventOriginalDate, "days").days
        );
        console.log("🔷 Drop - daysDiff:", daysDiff);

        if (daysDiff === 0) {
            this.setState({
                draggedEventId: null,
                draggedEventOriginalDate: null,
                dragOverDate: null,
            });
            return;
        }

        // Get calendar and event
        const calendar = (window as any).fc;
        if (!calendar) {
            console.error("No calendar instance found on window.fc");
            this.setState({
                draggedEventId: null,
                draggedEventOriginalDate: null,
                dragOverDate: null,
                dragPreview: null,
            });
            return;
        }

        const event = calendar.getEventById(draggedEventId);
        if (!event) {
            console.error(`Event ${draggedEventId} not found`);
            this.setState({
                draggedEventId: null,
                draggedEventOriginalDate: null,
                dragOverDate: null,
                dragPreview: null,
            });
            return;
        }

        // Store original dates for revert
        const oldStartDate = event.start;
        const oldEndDate = event.end;

        const oldStart = DateTime.fromJSDate(event.start);
        const oldEnd = event.end
            ? DateTime.fromJSDate(event.end)
            : oldStart.plus({ days: 1 });
        const duration = oldEnd.diff(oldStart, "days").days;

        const newStart = oldStart.plus({ days: daysDiff });
        const newEnd = newStart.plus({ days: duration });

        console.log(
            `🔷 Drag complete - saving event ${draggedEventId} to file`
        );

        // Store old event state for revert
        const oldEventState = event.toPlainObject();

        // Update the event immediately for visual feedback
        event.setStart(newStart.toJSDate());
        event.setEnd(newEnd.toJSDate());

        // Clear drag state
        this.setState({
            draggedEventId: null,
            draggedEventOriginalDate: null,
            dragOverDate: null,
            dragPreview: null,
        });

        // Save via the proper modifyEvent callback
        const modifyEventHandler = calendar.getOption("modifyEvent");
        if (modifyEventHandler) {
            modifyEventHandler(event, event)
                .then((success: any) => {
                    console.log(
                        `🔷 Save result for ${draggedEventId}:`,
                        success
                    );
                    if (!success) {
                        console.error("Failed to save event, reverting");
                        event.setStart(oldStartDate);
                        event.setEnd(oldEndDate);
                    }
                })
                .catch((error: any) => {
                    console.error("Error saving event:", error);
                    event.setStart(oldStartDate);
                    event.setEnd(oldEndDate);
                });
        } else {
            console.error("No modifyEvent handler found!");
        }
    };

    handleSelectionStart = (date: DateTime) => {
        console.log("🟢 handleSelectionStart:", date.toISODate());
        this.setState(
            {
                selectionStart: date,
                selectionCurrent: date,
                isSelecting: true,
            },
            () => {
                console.log("🟢 State updated:", this.state);
            }
        );
    };

    handleSelectionMove = (date: DateTime) => {
        if (this.state.isSelecting) {
            this.setState({ selectionCurrent: date });
        }
    };

    handleSelectionEnd = (date: DateTime) => {
        const { selectionStart, selectionCurrent, isSelecting } = this.state;

        if (!isSelecting || !selectionStart) {
            return;
        }

        // Use selectionCurrent if available, otherwise use the date from mouseUp
        const endDate = selectionCurrent || date;

        // Determine start and end dates
        const start = selectionStart < endDate ? selectionStart : endDate;
        const end = selectionStart < endDate ? endDate : selectionStart;

        // Create event using calendar instance
        try {
            const calendar = (window as any).fc;
            if (calendar) {
                // Use ISO date strings (YYYY-MM-DD) for all-day events
                const startStr = start.toISODate();
                const endStr = end.plus({ days: 1 }).toISODate();

                console.log(
                    "🟢 Calling select with ISO dates:",
                    startStr,
                    endStr
                );
                calendar.select(startStr, endStr);

                // Force refresh after a short delay to show new event
                setTimeout(() => {
                    this.forceUpdate();
                    console.log("🟢 Refreshed view after selection");
                }, 500);
            } else {
                console.warn("Calendar instance not found");
            }
        } catch (error) {
            console.error("Error creating event:", error);
        }

        // Clear selection
        this.setState({
            selectionStart: null,
            selectionCurrent: null,
            isSelecting: false,
        });
    };

    handleDayClick = (date: DateTime) => {
        try {
            const start = date.toJSDate();
            const end = date.plus({ days: 1 }).toJSDate();

            // Use the global calendar instance
            const calendar = (window as any).fc;
            if (calendar) {
                // Trigger a selection on the calendar
                calendar.select(start, end);
            } else {
                console.warn("Calendar instance not found on window.fc");
            }
        } catch (error) {
            console.error("Error creating event from click:", error);
        }
    };

    handleGlobalMouseUp = () => {
        if (this.state.isSelecting) {
            this.setState({
                selectionStart: null,
                selectionCurrent: null,
                isSelecting: false,
            });
        }
    };
}
