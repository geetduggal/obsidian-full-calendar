import * as React from "react";
import { DateTime } from "luxon";

interface EventData {
    id: string;
    title: string;
    color: string;
    textColor: string;
    start: DateTime;
    end: DateTime;
    isEditable: boolean;
}

interface LinearMonthProps {
    month: DateTime; // First day of the month
    events: EventData[];
    onDayClick: (date: DateTime) => void;
    onEventClick: (eventId: string, e: React.MouseEvent) => void;
    onDragStart: (eventId: string, date: DateTime, e: React.DragEvent) => void;
    onDragOver: (date: DateTime, e: React.DragEvent) => void;
    onDrop: (date: DateTime, e: React.DragEvent) => void;
    onSelectionStart: (date: DateTime) => void;
    onSelectionMove: (date: DateTime) => void;
    onSelectionEnd: (date: DateTime) => void;
    dragOverDate: DateTime | null;
    selectionStart: DateTime | null;
    selectionCurrent: DateTime | null;
    isSelecting: boolean;
}

const LinearMonthComponent = (props: LinearMonthProps) => {
    const {
        month,
        events,
        onDayClick,
        onEventClick,
        onDragStart,
        onDragOver,
        onDrop,
        onSelectionStart,
        onSelectionMove,
        onSelectionEnd,
        dragOverDate,
        selectionStart,
        selectionCurrent,
        isSelecting,
    } = props;

    const gridRef = React.useRef<HTMLDivElement>(null);
    const [cellWidth, setCellWidth] = React.useState(36);

    const daysInMonth = month.daysInMonth;
    const firstDayOfWeek = month.weekday % 7; // 0 = Sunday
    const today = DateTime.now();

    // Measure actual cell width on mount and resize
    React.useEffect(() => {
        const measureCellWidth = () => {
            if (gridRef.current) {
                const firstCell = gridRef.current.querySelector(
                    ".linear-cell:not(.linear-cell-empty)"
                );
                if (firstCell) {
                    const width = firstCell.getBoundingClientRect().width;
                    setCellWidth(width);
                }
            }
        };

        measureCellWidth();
        window.addEventListener("resize", measureCellWidth);
        return () => window.removeEventListener("resize", measureCellWidth);
    }, []);

    // Fixed layout: 37 columns (5 weeks + 2 days) to fit worst case: 31-day month starting on Saturday
    const totalColumns = 37;

    // Create array of cells
    const cells = [];
    for (let i = 0; i < totalColumns; i++) {
        const dayOffset = i - firstDayOfWeek;
        if (dayOffset >= 0 && dayOffset < daysInMonth) {
            const date = month.plus({ days: dayOffset });
            const isToday = date.hasSame(today, "day");
            const isWeekend = date.weekday === 6 || date.weekday === 7;
            const isDragOver = dragOverDate?.hasSame(date, "day") || false;

            // Check if date is in selection range
            let isSelected = false;
            if (selectionStart && selectionCurrent) {
                const start =
                    selectionStart < selectionCurrent
                        ? selectionStart
                        : selectionCurrent;
                const end =
                    selectionStart < selectionCurrent
                        ? selectionCurrent
                        : selectionStart;
                isSelected = date >= start && date <= end;
            }

            cells.push({
                date,
                dayNumber: date.day,
                isToday,
                isWeekend,
                isDragOver,
                isSelected,
                isEmpty: false,
            });
        } else {
            cells.push({
                date: null,
                dayNumber: null,
                isToday: false,
                isWeekend: false,
                isDragOver: false,
                isSelected: false,
                isEmpty: true,
            });
        }
    }

    // Find events that overlap with this month
    const monthStart = month.startOf("day");
    const monthEnd = month.endOf("month").startOf("day");

    console.log(
        `🟡 ${month.toFormat("MMM")}: Filtering ${events.length} events`
    );

    const monthEvents = events.filter((event) => {
        const eventStart = event.start.startOf("day");
        const eventEnd = event.end.startOf("day");

        // OVERLAP: Render events that overlap with this month
        // Allows multi-month events to span across boundaries
        const eventOverlapsMonth =
            eventStart <= monthEnd && eventEnd >= monthStart;

        return eventOverlapsMonth;
    });

    console.log(
        `🟡 ${month.toFormat("MMM")}: Rendering ${monthEvents.length} events`
    );

    // Calculate event lanes for stacking overlapping events
    interface EventWithPosition {
        event: (typeof monthEvents)[0];
        startCell: number;
        cellsToSpan: number;
        lane: number;
    }

    const eventsWithPositions: EventWithPosition[] = [];
    const lanes: { endCell: number }[] = [];

    // Sort events by start date to ensure proper lane assignment
    const sortedMonthEvents = [...monthEvents].sort((a, b) => {
        const aStart = a.start.toMillis();
        const bStart = b.start.toMillis();
        return aStart - bStart;
    });

    sortedMonthEvents.forEach((event) => {
        const eventStart = event.start.startOf("day");
        const eventEnd = event.end.startOf("day");

        const monthStart = month.startOf("day");
        // Use exclusive end (first day of next month) to match FullCalendar's exclusive end dates
        const monthEndExclusive = month
            .endOf("month")
            .plus({ days: 1 })
            .startOf("day");

        // Clip the event to this month's boundaries
        const clippedStart = eventStart < monthStart ? monthStart : eventStart;
        const clippedEnd =
            eventEnd > monthEndExclusive ? monthEndExclusive : eventEnd;

        const daysFromMonthStart = Math.max(
            0,
            clippedStart.diff(monthStart, "days").days
        );
        const startCell = firstDayOfWeek + Math.floor(daysFromMonthStart);

        if (startCell >= totalColumns) return;

        // Calculate duration based on clipped dates within this month
        // FullCalendar uses exclusive end dates, so duration is already correct
        // For a one-day event: end - start = 1 day, render 1 cell
        const durationDays = clippedEnd.diff(clippedStart, "days").days;
        const eventDuration = Math.round(durationDays);
        const cellsToSpan = Math.min(eventDuration, totalColumns - startCell);
        const endCell = startCell + cellsToSpan - 1;

        // Find first available lane where the previous event doesn't overlap
        // Two events don't overlap if one ends before the other starts
        let assignedLane = lanes.findIndex((lane) => lane.endCell < startCell);

        if (assignedLane === -1) {
            // No available lane found, create a new one
            assignedLane = lanes.length;
            lanes.push({ endCell });
        } else {
            // Update the lane's end position
            lanes[assignedLane].endCell = endCell;
        }

        eventsWithPositions.push({
            event,
            startCell,
            cellsToSpan,
            lane: assignedLane,
        });
    });

    const maxLanes = lanes.length;
    const cellHeight = Math.max(60, 18 + maxLanes * 22); // 18px for date + 22px per event lane

    return (
        <div
            className="linear-month-row"
            style={{
                display: "grid",
                gridTemplateColumns: "50px 1fr",
                margin: 0,
                padding: 0,
            }}
        >
            <div
                className="linear-month-label"
                style={{
                    fontSize: "0.85em",
                    fontWeight: 600,
                    padding: "0 8px 0 0",
                    textAlign: "right",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                }}
            >
                {month.toFormat("LLL")}
            </div>
            <div
                ref={gridRef}
                className="linear-month-grid"
                style={{
                    display: "flex",
                    flexWrap: "nowrap",
                    minWidth: "100%",
                    gap: 0,
                    position: "relative",
                    minHeight: `${cellHeight}px`,
                }}
            >
                {cells.map((cell, index) => {
                    const key = cell.date?.toISODate() || `empty-${index}`;
                    const classNames = [
                        "linear-cell",
                        cell.isEmpty && "linear-cell-empty",
                        cell.isWeekend && "linear-cell-weekend",
                        cell.isToday && "linear-cell-today",
                        cell.isDragOver && "linear-cell-drop-target",
                        cell.isSelected && "linear-cell-selected",
                    ]
                        .filter(Boolean)
                        .join(" ");

                    return (
                        <div
                            key={key}
                            className={classNames}
                            ref={(el) => {
                                if (el && cell.date && !cell.isEmpty) {
                                    // Only attach if not already attached
                                    if (!(el as any)._handlersAttached) {
                                        (el as any)._handlersAttached = true;
                                        el.onmousedown = (e) => {
                                            if (e.button === 0) {
                                                e.preventDefault();
                                                onSelectionStart(cell.date);
                                            }
                                        };
                                        el.onmouseenter = (e) => {
                                            if (e.buttons === 1) {
                                                e.preventDefault();
                                                onSelectionMove(cell.date);
                                            }
                                        };
                                        el.onmouseup = (e) => {
                                            onSelectionEnd(cell.date);
                                        };
                                    }
                                }
                            }}
                            style={{
                                flex: "1 0 36px",
                                minWidth: "36px",
                                border: "0.5px solid #d0d0d0",
                                minHeight: "32px",
                                display: "flex",
                                alignItems: "flex-start",
                                justifyContent: "flex-start",
                                padding: 0,
                                margin: 0,
                                cursor: "pointer",
                                position: "relative",
                                backgroundColor: cell.isSelected
                                    ? "#fef9c3"
                                    : cell.isWeekend
                                    ? "#f5f5f5"
                                    : "var(--background-primary)",
                                visibility: cell.isEmpty ? "hidden" : "visible",
                                userSelect: "none",
                            }}
                            onMouseDown={(e) => {
                                if (
                                    cell.date &&
                                    e.button === 0 &&
                                    !cell.isEmpty
                                ) {
                                    e.preventDefault(); // Prevent text selection
                                    onSelectionStart(cell.date);
                                }
                            }}
                            onMouseEnter={(e) => {
                                if (
                                    cell.date &&
                                    !cell.isEmpty &&
                                    e.buttons === 1
                                ) {
                                    e.preventDefault();
                                    onSelectionMove(cell.date);
                                }
                            }}
                            onMouseUp={(e) => {
                                if (cell.date && !cell.isEmpty) {
                                    onSelectionEnd(cell.date);
                                }
                            }}
                            onClick={(e) => {
                                // Fallback click handler
                                if (
                                    cell.date &&
                                    !cell.isEmpty &&
                                    e.target === e.currentTarget
                                ) {
                                    onDayClick(cell.date);
                                }
                            }}
                            onDragOver={(e) => {
                                if (cell.date) {
                                    e.preventDefault();
                                    onDragOver(cell.date, e);
                                }
                            }}
                            onDrop={(e) => {
                                if (cell.date) {
                                    e.preventDefault();
                                    onDrop(cell.date, e);
                                }
                            }}
                        >
                            {!cell.isEmpty && (
                                <span className="linear-date-number">
                                    {cell.dayNumber}
                                </span>
                            )}
                        </div>
                    );
                })}
                {/* Render events as overlays with calculated lanes */}
                {eventsWithPositions.map(
                    ({ event, startCell, cellsToSpan, lane }) => {
                        const eventStart = event.start.startOf("day");

                        // Calculate absolute position (using actual cell width)
                        const cellWidthPx = cellWidth; // Use measured cell width
                        const left = `${startCell * cellWidthPx}px`;
                        const width = `${cellsToSpan * cellWidthPx}px`;
                        const top = 18 + lane * 22; // 18px for date number, then 22px per lane

                        return (
                            <div
                                key={event.id}
                                className="linear-event-overlay"
                                ref={(el) => {
                                    if (el && event.isEditable) {
                                        // Only attach if not already attached
                                        if (!(el as any)._handlersAttached) {
                                            (el as any)._handlersAttached =
                                                true;
                                            el.setAttribute(
                                                "draggable",
                                                "true"
                                            );
                                            el.ondragstart = (e) => {
                                                onDragStart(
                                                    event.id,
                                                    eventStart,
                                                    e as any
                                                );
                                            };
                                        }
                                    }
                                }}
                                style={{
                                    position: "absolute",
                                    top: `${top}px`,
                                    left,
                                    width,
                                    height: "18px",
                                    backgroundColor: event.color,
                                    color: event.textColor,
                                    borderRadius: "2px",
                                    padding: "2px 4px",
                                    fontSize: "0.7em",
                                    fontWeight: 500,
                                    cursor: "pointer",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.2)",
                                    zIndex: 100,
                                    pointerEvents: isSelecting
                                        ? "none"
                                        : "auto",
                                    display: "flex",
                                    alignItems: "center",
                                    lineHeight: "1.2",
                                }}
                                draggable={event.isEditable}
                                onDragStart={(e) => {
                                    if (event.isEditable) {
                                        onDragStart(event.id, eventStart, e);
                                    }
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    onEventClick(event.id, e);
                                }}
                                title={event.title}
                            >
                                <span className="linear-event-title">
                                    {event.title}
                                </span>
                            </div>
                        );
                    }
                )}
            </div>
        </div>
    );
};

// Memoize to prevent unnecessary re-renders when props haven't changed
export const LinearMonth = React.memo(
    LinearMonthComponent,
    (prevProps, nextProps) => {
        // Return true if props are equal (skip re-render), false if changed (do re-render)
        const sameMonth = prevProps.month.equals(nextProps.month);
        const sameEvents = prevProps.events === nextProps.events;
        const sameDragOver =
            (prevProps.dragOverDate === null &&
                nextProps.dragOverDate === null) ||
            (prevProps.dragOverDate?.equals(
                nextProps.dragOverDate || DateTime.fromMillis(0)
            ) ??
                false);
        const sameSelection =
            prevProps.isSelecting === nextProps.isSelecting &&
            ((prevProps.selectionStart === null &&
                nextProps.selectionStart === null) ||
                (prevProps.selectionStart?.equals(
                    nextProps.selectionStart || DateTime.fromMillis(0)
                ) ??
                    false)) &&
            ((prevProps.selectionCurrent === null &&
                nextProps.selectionCurrent === null) ||
                (prevProps.selectionCurrent?.equals(
                    nextProps.selectionCurrent || DateTime.fromMillis(0)
                ) ??
                    false));

        return sameMonth && sameEvents && sameDragOver && sameSelection;
    }
);
