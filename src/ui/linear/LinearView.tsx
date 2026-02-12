import * as React from "react";
import { flushSync } from "react-dom";
import { DateTime } from "luxon";
import { sliceEvents } from "@fullcalendar/core";
import { LinearMonth } from "./LinearMonth";
import "./linear.css";

// Color palette matching FullCalendar's default event colors (light pastels)
const PROPERTY_COLORS = [
    "#c5e1a5", // Light green (most common in month view)
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
    filterType: string;
    filters: string[]; // Multiple filters with OR logic
    filterSearchText: string;
    showFilterDropdown: boolean;
    filterKeySearchText: string;
    showFilterKeyDropdown: boolean;
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
    private filterKeyInputRef: React.RefObject<HTMLInputElement> =
        React.createRef();
    private recentlyUpdatedEvents: Set<string> = new Set(); // Track events we just updated

    constructor(props: any) {
        super(props);

        // Restore filter state from window if available
        const savedFilter = (window as any).linearViewFilterState;

        this.state = {
            draggedEventId: null,
            draggedEventOriginalDate: null,
            dragOverDate: null,
            selectionStart: null,
            selectionCurrent: null,
            isSelecting: false,
            dragPreview: null,
            filterType: savedFilter?.filterType || "folder",
            filters: savedFilter?.filters || [],
            filterSearchText: "",
            showFilterDropdown: false,
            filterKeySearchText: "",
            showFilterKeyDropdown: false,
        };
    }

    // Helper to normalize property value (remove quotes and extract from wiki links if needed)
    private normalizeValue(value: string | null): string | null {
        if (!value) return null;
        // Remove surrounding quotes if present
        let cleaned = value.replace(/^['"]|['"]$/g, "");
        // Extract from [[Filename]] format if present
        const match = cleaned.match(/\[\[([^\]]+)\]\]/);
        return match ? match[1] : cleaned;
    }

    // Get all unique property keys from events
    private getUniquePropertyKeys(): string[] {
        if (!this.cachedEvents) {
            return [];
        }

        const keys = new Set<string>();
        this.cachedEvents.forEach((event) => {
            if (event.customProps) {
                for (const key of Object.keys(event.customProps)) {
                    if (key !== "isTask" && key !== "taskCompleted") {
                        keys.add(key);
                    }
                }
            }
        });

        return Array.from(keys).sort();
    }

    // Get all unique values for the current filter type
    private getUniqueValues(): string[] {
        if (!this.cachedEvents) {
            return [];
        }

        const values = new Set<string>();
        this.cachedEvents.forEach((event) => {
            const value = event.customProps?.[this.state.filterType];
            if (value) {
                const normalized = this.normalizeValue(value);
                if (normalized) values.add(normalized);
            }
        });

        return Array.from(values).sort();
    }

    // Get all markdown files for wiki-link autocomplete
    private getAllFiles(): string[] {
        // Access Obsidian vault through global app instance
        const app = (window as any).app;
        if (!app || !app.vault) {
            return [];
        }
        return app.vault
            .getMarkdownFiles()
            .map((file: any) => file.basename)
            .sort();
    }

    // Get suggestions for filter value input
    private getFilterValueSuggestions(): string[] {
        if (!this.state.filterSearchText) {
            return this.getUniqueValues();
        }

        // Check if user is typing a wiki-link
        const wikiLinkMatch = this.state.filterSearchText.match(/\[\[([^\]]*)/);
        if (wikiLinkMatch) {
            const searchTerm = wikiLinkMatch[1].toLowerCase();
            return this.getAllFiles()
                .filter((file) => file.toLowerCase().includes(searchTerm))
                .slice(0, 10)
                .map((file) => `[[${file}]]`);
        }

        // Regular value autocomplete
        const searchLower = this.state.filterSearchText.toLowerCase();
        return this.getUniqueValues()
            .filter((value) => value.toLowerCase().includes(searchLower))
            .slice(0, 20);
    }

    // Get suggestions for filter key input
    private getFilterKeySuggestions(): string[] {
        if (!this.state.filterKeySearchText) {
            return this.getUniquePropertyKeys();
        }

        const searchLower = this.state.filterKeySearchText.toLowerCase();
        return this.getUniquePropertyKeys()
            .filter((key) => key.toLowerCase().includes(searchLower))
            .slice(0, 20);
    }

    // Removed shouldComponentUpdate to allow React to handle all updates
    // This ensures external file changes trigger re-renders properly

    componentDidUpdate() {
        // Store the current filter in window so modal can access it for auto-fill
        (window as any).linearViewActiveFilter = {
            type: this.state.filterType,
            values: this.state.filters,
        };

        // Persist filter state across component recreations
        (window as any).linearViewFilterState = {
            filterType: this.state.filterType,
            filters: this.state.filters,
        };
    }

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

                // Get all custom properties from extended props
                const customProps = seg.def.extendedProps || {};

                // Find first non-empty property value to use for coloring
                // Priority: folder > box > shelve > any other property
                const propertyPriority = ["folder", "box", "shelve"];
                let colorProperty = null;

                for (const key of propertyPriority) {
                    if (customProps[key]) {
                        colorProperty = this.normalizeValue(customProps[key]);
                        break;
                    }
                }

                // If no priority property, use first available custom property
                if (!colorProperty) {
                    for (const [key, value] of Object.entries(customProps)) {
                        if (
                            value &&
                            key !== "isTask" &&
                            key !== "taskCompleted"
                        ) {
                            colorProperty = this.normalizeValue(
                                value as string
                            );
                            break;
                        }
                    }
                }

                const propertyColor = colorProperty
                    ? hashStringToColor(colorProperty)
                    : null;
                const eventColor =
                    propertyColor ||
                    seg.def.ui.backgroundColor ||
                    seg.ui.backgroundColor ||
                    "#3788d8";
                const textColor = propertyColor
                    ? "#1a1a1a"
                    : seg.def.ui.textColor || seg.ui.textColor || "#000";

                return {
                    id: seg.def.publicId,
                    title: seg.def.title,
                    color: eventColor,
                    textColor: textColor,
                    start: startDate,
                    end: endDate,
                    isEditable: seg.def.ui.editable !== false,
                    customProps: customProps, // Store all custom properties
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

        // Get suggestions for the filter value input
        const filteredValues = this.getFilterValueSuggestions().slice(0, 20);

        // Apply filters with OR logic based on filter type
        if (this.state.filters.length > 0) {
            events = events.filter((e) => {
                const eventValue = e.customProps?.[this.state.filterType];
                if (!eventValue) return false;
                const normalized = this.normalizeValue(eventValue);
                return normalized && this.state.filters.includes(normalized);
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
                {/* Property filter */}
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
                            Filter by
                        </span>
                        <div
                            style={{ position: "relative", minWidth: "120px" }}
                        >
                            <input
                                ref={this.filterKeyInputRef}
                                type="text"
                                placeholder="Property key..."
                                value={
                                    this.state.filterKeySearchText ||
                                    this.state.filterType
                                }
                                onChange={(e) => {
                                    this.setState({
                                        filterKeySearchText: e.target.value,
                                        showFilterKeyDropdown: true,
                                    });
                                }}
                                onFocus={() => {
                                    this.setState({
                                        filterKeySearchText: "",
                                        showFilterKeyDropdown: true,
                                    });
                                }}
                                onBlur={() => {
                                    setTimeout(() => {
                                        // If user didn't select anything, restore the current filterType
                                        if (
                                            this.state.filterKeySearchText &&
                                            !this.getFilterKeySuggestions().includes(
                                                this.state.filterKeySearchText
                                            )
                                        ) {
                                            this.setState({
                                                filterKeySearchText: "",
                                                showFilterKeyDropdown: false,
                                            });
                                        } else {
                                            this.setState({
                                                showFilterKeyDropdown: false,
                                            });
                                        }
                                    }, 200);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Escape") {
                                        this.setState({
                                            filterKeySearchText: "",
                                            showFilterKeyDropdown: false,
                                        });
                                    }
                                }}
                                style={{
                                    padding: "4px 8px",
                                    fontSize: "0.85em",
                                    borderRadius: "4px",
                                    border: "1px solid var(--background-modifier-border)",
                                    backgroundColor:
                                        "var(--background-primary)",
                                    color: "var(--text-normal)",
                                    width: "100%",
                                }}
                            />
                            {this.state.showFilterKeyDropdown &&
                                this.getFilterKeySuggestions().length > 0 && (
                                    <div
                                        style={{
                                            position: "absolute",
                                            top: "100%",
                                            left: 0,
                                            right: 0,
                                            marginTop: "4px",
                                            maxHeight: "200px",
                                            overflowY: "auto",
                                            backgroundColor:
                                                "var(--background-primary)",
                                            border: "1px solid var(--background-modifier-border)",
                                            borderRadius: "4px",
                                            boxShadow:
                                                "0 4px 12px rgba(0,0,0,0.15)",
                                            zIndex: 2000,
                                        }}
                                    >
                                        {this.getFilterKeySuggestions().map(
                                            (key) => (
                                                <div
                                                    key={key}
                                                    onMouseDown={() => {
                                                        this.setState({
                                                            filterType: key,
                                                            filterKeySearchText:
                                                                "",
                                                            showFilterKeyDropdown:
                                                                false,
                                                            filters: [], // Clear filters when changing type
                                                            filterSearchText:
                                                                "",
                                                        });
                                                    }}
                                                    style={{
                                                        padding: "6px 10px",
                                                        cursor: "pointer",
                                                        fontSize: "0.85em",
                                                        borderBottom:
                                                            "1px solid var(--background-modifier-border)",
                                                    }}
                                                    onMouseEnter={(e) =>
                                                        (e.currentTarget.style.backgroundColor =
                                                            "var(--background-modifier-hover)")
                                                    }
                                                    onMouseLeave={(e) =>
                                                        (e.currentTarget.style.backgroundColor =
                                                            "transparent")
                                                    }
                                                >
                                                    {key}
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}
                        </div>
                        <span
                            style={{
                                fontSize: "0.9em",
                                fontWeight: 600,
                                color: "var(--text-muted)",
                            }}
                        >
                            :
                        </span>
                        {/* Show selected filters as chips */}
                        {this.state.filters.map((value) => (
                            <div
                                key={value}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    padding: "4px 8px",
                                    backgroundColor: hashStringToColor(value),
                                    borderRadius: "12px",
                                    fontSize: "0.85em",
                                    color: "#1a1a1a",
                                }}
                            >
                                <span>{value}</span>
                                <button
                                    onClick={() => {
                                        this.setState({
                                            filters: this.state.filters.filter(
                                                (f) => f !== value
                                            ),
                                        });
                                    }}
                                    style={{
                                        border: "none",
                                        background: "none",
                                        cursor: "pointer",
                                        fontSize: "1.2em",
                                        color: "#ffffff",
                                        padding: 0,
                                        lineHeight: "1",
                                        fontWeight: "bold",
                                    }}
                                    title={`Remove ${value} filter`}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                        {this.state.filters.length > 1 && (
                            <button
                                onClick={() => this.setState({ filters: [] })}
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
                        {this.state.filters.length > 0 && (
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
                            placeholder={`Type to add ${this.state.filterType} filter...`}
                            value={this.state.filterSearchText}
                            onChange={(e) =>
                                this.setState({
                                    filterSearchText: e.target.value,
                                })
                            }
                            onFocus={() =>
                                this.setState({ showFilterDropdown: true })
                            }
                            onBlur={() =>
                                setTimeout(
                                    () =>
                                        this.setState({
                                            showFilterDropdown: false,
                                        }),
                                    200
                                )
                            }
                            onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                    this.setState({
                                        filterSearchText: "",
                                        showFilterDropdown: false,
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
                        {this.state.showFilterDropdown &&
                            filteredValues.length > 0 && (
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
                                    {filteredValues.map((value) => {
                                        const eventCount =
                                            this.cachedEvents!.filter((e) => {
                                                const eventValue =
                                                    e.customProps?.[
                                                        this.state.filterType
                                                    ];
                                                return (
                                                    this.normalizeValue(
                                                        eventValue
                                                    ) === value
                                                );
                                            }).length;
                                        const isSelected =
                                            this.state.filters.includes(value);

                                        return (
                                            <div
                                                key={value}
                                                onMouseDown={() => {
                                                    if (!isSelected) {
                                                        // Extract the actual value (remove [[ ]] if present)
                                                        const normalizedValue =
                                                            this.normalizeValue(
                                                                value
                                                            ) || value;
                                                        this.setState({
                                                            filters: [
                                                                ...this.state
                                                                    .filters,
                                                                normalizedValue,
                                                            ],
                                                            filterSearchText:
                                                                "",
                                                            showFilterDropdown:
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
                                                                    value
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
                                                        {value}
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
            `🔷 Drag complete - saving event ${draggedEventId} to file (NO optimistic update)`
        );

        // Clear drag state
        this.setState({
            draggedEventId: null,
            draggedEventOriginalDate: null,
            dragOverDate: null,
            dragPreview: null,
        });

        // Save to file - cache update will handle the visual change
        // NO optimistic rendering to prevent duplicates
        const modifyEventHandler = (window as any).fcModifyEvent;
        if (modifyEventHandler) {
            // Convert EventApi to OFCEvent format
            const newEventData = {
                title: event.title,
                date: newStart.toISODate(),
                endDate: newEnd.toISODate(),
                allDay: event.allDay,
                type: "single" as const,
            };

            modifyEventHandler(draggedEventId, newEventData)
                .then((success: any) => {
                    console.log(
                        `🔷 Save result for ${draggedEventId}:`,
                        success
                    );
                    if (!success) {
                        console.error("Failed to save event");
                        // Cache update will restore original position
                    }
                })
                .catch((error: any) => {
                    console.error("Error saving event:", error);
                    // Cache update will restore original position
                });
        } else {
            console.error("No fcModifyEvent handler found on window!");
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
