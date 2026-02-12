import { DateTime } from "luxon";
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { CalendarInfo, OFCEvent } from "../../types";

function makeChangeListener<T>(
    setState: React.Dispatch<React.SetStateAction<T>>,
    fromString: (val: string) => T
): React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement> {
    return (e) => setState(fromString(e.target.value));
}

interface DayChoiceProps {
    code: string;
    label: string;
    isSelected: boolean;
    onClick: (code: string) => void;
}
const DayChoice = ({ code, label, isSelected, onClick }: DayChoiceProps) => (
    <button
        type="button"
        style={{
            marginLeft: "0.25rem",
            marginRight: "0.25rem",
            padding: "0",
            backgroundColor: isSelected
                ? "var(--interactive-accent)"
                : "var(--interactive-normal)",
            color: isSelected ? "var(--text-on-accent)" : "var(--text-normal)",
            borderStyle: "solid",
            borderWidth: "1px",
            borderRadius: "50%",
            width: "25px",
            height: "25px",
        }}
        onClick={() => onClick(code)}
    >
        <b>{label[0]}</b>
    </button>
);

const DAY_MAP = {
    U: "Sunday",
    M: "Monday",
    T: "Tuesday",
    W: "Wednesday",
    R: "Thursday",
    F: "Friday",
    S: "Saturday",
};

const DaySelect = ({
    value: days,
    onChange,
}: {
    value: string[];
    onChange: (days: string[]) => void;
}) => {
    return (
        <div>
            {Object.entries(DAY_MAP).map(([code, label]) => (
                <DayChoice
                    key={code}
                    code={code}
                    label={label}
                    isSelected={days.includes(code)}
                    onClick={() =>
                        days.includes(code)
                            ? onChange(days.filter((c) => c !== code))
                            : onChange([code, ...days])
                    }
                />
            ))}
        </div>
    );
};

interface EditEventProps {
    submit: (frontmatter: OFCEvent, calendarIndex: number) => Promise<void>;
    readonly calendars: {
        id: string;
        name: string;
        type: CalendarInfo["type"];
    }[];
    defaultCalendarIndex: number;
    initialEvent?: Partial<OFCEvent>;
    open?: () => Promise<void>;
    deleteEvent?: () => Promise<void>;
    allPropertyKeys?: string[]; // All property keys from existing events
    allPropertyValues?: Map<string, string[]>; // Map of property key to array of values
    allFiles?: string[]; // All file names in vault for wiki-link autocomplete
}

export const EditEvent = ({
    initialEvent,
    submit,
    open,
    deleteEvent,
    calendars,
    defaultCalendarIndex,
    allPropertyKeys = [],
    allPropertyValues = new Map(),
    allFiles = [],
}: EditEventProps) => {
    const [date, setDate] = useState(
        initialEvent
            ? initialEvent.type === "single"
                ? initialEvent.date
                : initialEvent.type === "recurring"
                ? initialEvent.startRecur
                : initialEvent.type === "rrule"
                ? initialEvent.startDate
                : ""
            : ""
    );
    const [endDate, setEndDate] = useState(
        initialEvent && initialEvent.type === "single"
            ? initialEvent.endDate
            : undefined
    );

    let initialStartTime = "";
    let initialEndTime = "";
    if (initialEvent) {
        const event = initialEvent as any;
        initialStartTime = event.startTime || "";
        initialEndTime = event.endTime || "";
    }

    const [startTime, setStartTime] = useState(initialStartTime);
    const [endTime, setEndTime] = useState(initialEndTime);
    const [title, setTitle] = useState(initialEvent?.title || "");
    const [isRecurring, setIsRecurring] = useState(
        initialEvent?.type === "recurring" || false
    );
    const [endRecur, setEndRecur] = useState("");

    const [daysOfWeek, setDaysOfWeek] = useState<string[]>(
        (initialEvent?.type === "recurring" ? initialEvent.daysOfWeek : []) ||
            []
    );

    const [allDay, setAllDay] = useState(
        initialEvent && "allDay" in initialEvent ? initialEvent.allDay : true
    );

    const [calendarIndex, setCalendarIndex] = useState(defaultCalendarIndex);

    const [complete, setComplete] = useState(
        initialEvent?.type === "single" &&
            initialEvent.completed !== null &&
            initialEvent.completed !== undefined
            ? initialEvent.completed
            : false
    );

    const [isTask, setIsTask] = useState(
        initialEvent?.type === "single" &&
            initialEvent.completed !== undefined &&
            initialEvent.completed !== null
    );

    // Generic metadata properties (any YAML frontmatter beyond standard fields)
    const getInitialMetadata = (): Record<string, string> => {
        if (!initialEvent) return {};
        const {
            title,
            date,
            endDate,
            startTime,
            endTime,
            allDay,
            type,
            daysOfWeek,
            startRecur,
            endRecur,
            completed,
            id,
            ...rest
        } = initialEvent as any;
        // Convert all values to strings
        const stringProps: Record<string, string> = {};
        for (const [key, value] of Object.entries(rest)) {
            if (value !== undefined && value !== null) {
                stringProps[key] = String(value);
            }
        }
        return stringProps;
    };
    const [metadata, setMetadata] = useState<Record<string, string>>(
        getInitialMetadata()
    );
    const [newPropertyKey, setNewPropertyKey] = useState("");
    const [newPropertyValue, setNewPropertyValue] = useState("");
    const [showKeyDropdown, setShowKeyDropdown] = useState(false);
    const [showValueDropdown, setShowValueDropdown] = useState(false);
    const [selectedKeySuggestionIndex, setSelectedKeySuggestionIndex] =
        useState(0);
    const [selectedValueSuggestionIndex, setSelectedValueSuggestionIndex] =
        useState(0);
    const [editingValueDropdown, setEditingValueDropdown] = useState<
        string | null
    >(null);

    // Get filtered suggestions for property keys
    const getKeySuggestions = (): string[] => {
        if (!newPropertyKey) return allPropertyKeys.slice(0, 10);
        return allPropertyKeys
            .filter((key) =>
                key.toLowerCase().includes(newPropertyKey.toLowerCase())
            )
            .slice(0, 10);
    };

    // Get filtered suggestions for property values
    const getValueSuggestions = (): string[] => {
        if (!newPropertyKey) return [];

        // Check if value contains [[ for wiki-link autocomplete
        const wikiLinkMatch = newPropertyValue.match(/\[\[([^\]]*)/);
        if (wikiLinkMatch) {
            const searchTerm = wikiLinkMatch[1].toLowerCase();
            return allFiles
                .filter((file) => file.toLowerCase().includes(searchTerm))
                .slice(0, 10)
                .map((file) => `[[${file}]]`);
        }

        // Regular value autocomplete from existing values
        const existingValues = allPropertyValues.get(newPropertyKey) || [];
        if (!newPropertyValue) return existingValues.slice(0, 10);
        return existingValues
            .filter((val) =>
                val.toLowerCase().includes(newPropertyValue.toLowerCase())
            )
            .slice(0, 10);
    };

    // Get suggestions for editing an existing property value
    const getEditValueSuggestions = (
        key: string,
        currentValue: string
    ): string[] => {
        // Check if value contains [[ for wiki-link autocomplete
        const wikiLinkMatch = currentValue.match(/\[\[([^\]]*)/);
        if (wikiLinkMatch) {
            const searchTerm = wikiLinkMatch[1].toLowerCase();
            return allFiles
                .filter((file) => file.toLowerCase().includes(searchTerm))
                .slice(0, 10)
                .map((file) => `[[${file}]]`);
        }

        // Regular value autocomplete from existing values
        const existingValues = allPropertyValues.get(key) || [];
        if (!currentValue) return existingValues.slice(0, 10);
        return existingValues
            .filter((val) =>
                val.toLowerCase().includes(currentValue.toLowerCase())
            )
            .slice(0, 10);
    };

    const titleRef = useRef<HTMLInputElement>(null);
    const keyInputRef = useRef<HTMLInputElement>(null);
    const valueInputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (titleRef.current) {
            titleRef.current.focus();
        }
    }, [titleRef]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        await submit(
            {
                ...{ title },
                ...(allDay
                    ? { allDay: true }
                    : { allDay: false, startTime: startTime || "", endTime }),
                ...(isRecurring
                    ? {
                          type: "recurring",
                          daysOfWeek: daysOfWeek as (
                              | "U"
                              | "M"
                              | "T"
                              | "W"
                              | "R"
                              | "F"
                              | "S"
                          )[],
                          startRecur: date || undefined,
                          endRecur: endRecur || undefined,
                      }
                    : {
                          type: "single",
                          date: date || "",
                          endDate: endDate || null,
                          completed: isTask ? complete : null,
                      }),
                ...metadata, // Include all custom metadata properties
            } as OFCEvent,
            calendarIndex
        );
    };

    return (
        <>
            <div>
                <p style={{ float: "right" }}>
                    {open && <button onClick={open}>Open Note</button>}
                </p>
            </div>

            <form onSubmit={handleSubmit}>
                <p>
                    <input
                        ref={titleRef}
                        type="text"
                        id="title"
                        value={title}
                        placeholder={"Add title"}
                        required
                        onChange={makeChangeListener(setTitle, (x) => x)}
                    />
                </p>
                <p>
                    <select
                        id="calendar"
                        value={calendarIndex}
                        onChange={makeChangeListener(
                            setCalendarIndex,
                            parseInt
                        )}
                    >
                        {calendars
                            .flatMap((cal) =>
                                cal.type === "local" || cal.type === "dailynote"
                                    ? [cal]
                                    : []
                            )
                            .map((cal, idx) => (
                                <option
                                    key={idx}
                                    value={idx}
                                    disabled={
                                        !(
                                            initialEvent?.title === undefined ||
                                            calendars[calendarIndex].type ===
                                                cal.type
                                        )
                                    }
                                >
                                    {cal.type === "local"
                                        ? cal.name
                                        : "Daily Note"}
                                </option>
                            ))}
                    </select>
                </p>
                <p>
                    {!isRecurring && (
                        <input
                            type="date"
                            id="date"
                            value={date}
                            required={!isRecurring}
                            // @ts-ignore
                            onChange={makeChangeListener(setDate, (x) => x)}
                        />
                    )}

                    {allDay ? (
                        <></>
                    ) : (
                        <>
                            <input
                                type="time"
                                id="startTime"
                                value={startTime}
                                required
                                onChange={makeChangeListener(
                                    setStartTime,
                                    (x) => x
                                )}
                            />
                            -
                            <input
                                type="time"
                                id="endTime"
                                value={endTime}
                                required
                                onChange={makeChangeListener(
                                    setEndTime,
                                    (x) => x
                                )}
                            />
                        </>
                    )}
                </p>

                {/* Generic metadata properties editor */}
                <div style={{ marginTop: "16px", marginBottom: "16px" }}>
                    <label
                        style={{
                            fontWeight: "600",
                            marginBottom: "8px",
                            display: "block",
                        }}
                    >
                        Properties
                    </label>

                    {/* Show existing properties */}
                    {Object.entries(metadata).map(([key, value]) => (
                        <div
                            key={key}
                            style={{
                                display: "flex",
                                gap: "8px",
                                marginBottom: "8px",
                                alignItems: "center",
                                position: "relative",
                            }}
                        >
                            <input
                                type="text"
                                value={key}
                                readOnly
                                style={{
                                    flex: "0 0 120px",
                                    backgroundColor:
                                        "var(--background-secondary)",
                                    fontSize: "0.9em",
                                }}
                            />
                            <div style={{ flex: "1", position: "relative" }}>
                                <input
                                    type="text"
                                    value={value}
                                    onChange={(e) => {
                                        setMetadata({
                                            ...metadata,
                                            [key]: e.target.value,
                                        });
                                        setEditingValueDropdown(key);
                                    }}
                                    onFocus={() => setEditingValueDropdown(key)}
                                    onBlur={() =>
                                        setTimeout(
                                            () => setEditingValueDropdown(null),
                                            200
                                        )
                                    }
                                    style={{ width: "100%" }}
                                />
                                {editingValueDropdown === key &&
                                    getEditValueSuggestions(key, value).length >
                                        0 && (
                                        <div
                                            style={{
                                                position: "absolute",
                                                top: "100%",
                                                left: 0,
                                                right: 0,
                                                maxHeight: "150px",
                                                overflowY: "auto",
                                                backgroundColor:
                                                    "var(--background-primary)",
                                                border: "1px solid var(--background-modifier-border)",
                                                borderRadius: "4px",
                                                zIndex: 1000,
                                                marginTop: "2px",
                                                boxShadow:
                                                    "0 4px 12px rgba(0,0,0,0.15)",
                                            }}
                                        >
                                            {getEditValueSuggestions(
                                                key,
                                                value
                                            ).map((suggestion) => (
                                                <div
                                                    key={suggestion}
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        setMetadata({
                                                            ...metadata,
                                                            [key]: suggestion,
                                                        });
                                                        setEditingValueDropdown(
                                                            null
                                                        );
                                                    }}
                                                    style={{
                                                        padding: "8px 12px",
                                                        cursor: "pointer",
                                                        fontSize: "0.9em",
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
                                                    {suggestion}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    const newMeta = { ...metadata };
                                    delete newMeta[key];
                                    setMetadata(newMeta);
                                }}
                                style={{
                                    padding: "4px 8px",
                                    cursor: "pointer",
                                    backgroundColor:
                                        "var(--background-modifier-error)",
                                    border: "none",
                                    borderRadius: "4px",
                                    color: "var(--text-on-accent)",
                                }}
                            >
                                ×
                            </button>
                        </div>
                    ))}

                    {/* Add new property */}
                    <div
                        style={{
                            display: "flex",
                            gap: "8px",
                            marginTop: "12px",
                            position: "relative",
                        }}
                    >
                        <div
                            style={{ flex: "0 0 120px", position: "relative" }}
                        >
                            <input
                                ref={keyInputRef}
                                type="text"
                                value={newPropertyKey}
                                onChange={(e) => {
                                    setNewPropertyKey(e.target.value);
                                    setShowKeyDropdown(true);
                                    setSelectedKeySuggestionIndex(0);
                                }}
                                onFocus={() => setShowKeyDropdown(true)}
                                onBlur={() =>
                                    setTimeout(
                                        () => setShowKeyDropdown(false),
                                        200
                                    )
                                }
                                onKeyDown={(e) => {
                                    const suggestions = getKeySuggestions();
                                    if (e.key === "ArrowDown") {
                                        e.preventDefault();
                                        setSelectedKeySuggestionIndex((prev) =>
                                            Math.min(
                                                prev + 1,
                                                suggestions.length - 1
                                            )
                                        );
                                    } else if (e.key === "ArrowUp") {
                                        e.preventDefault();
                                        setSelectedKeySuggestionIndex((prev) =>
                                            Math.max(prev - 1, 0)
                                        );
                                    } else if (
                                        e.key === "Enter" &&
                                        showKeyDropdown &&
                                        suggestions.length > 0
                                    ) {
                                        e.preventDefault();
                                        setNewPropertyKey(
                                            suggestions[
                                                selectedKeySuggestionIndex
                                            ]
                                        );
                                        setShowKeyDropdown(false);
                                        valueInputRef.current?.focus();
                                    } else if (e.key === "Tab") {
                                        setShowKeyDropdown(false);
                                    }
                                }}
                                placeholder="Property name"
                                style={{ width: "100%", fontSize: "0.9em" }}
                            />
                            {showKeyDropdown &&
                                getKeySuggestions().length > 0 && (
                                    <div
                                        style={{
                                            position: "absolute",
                                            top: "100%",
                                            left: 0,
                                            right: 0,
                                            maxHeight: "200px",
                                            overflowY: "auto",
                                            backgroundColor:
                                                "var(--background-primary)",
                                            border: "1px solid var(--background-modifier-border)",
                                            borderRadius: "4px",
                                            zIndex: 1000,
                                            marginTop: "2px",
                                            boxShadow:
                                                "0 4px 12px rgba(0,0,0,0.15)",
                                        }}
                                    >
                                        {getKeySuggestions().map((key, idx) => (
                                            <div
                                                key={key}
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    setNewPropertyKey(key);
                                                    setShowKeyDropdown(false);
                                                    valueInputRef.current?.focus();
                                                }}
                                                style={{
                                                    padding: "8px 12px",
                                                    cursor: "pointer",
                                                    backgroundColor:
                                                        idx ===
                                                        selectedKeySuggestionIndex
                                                            ? "var(--background-modifier-hover)"
                                                            : "transparent",
                                                    fontSize: "0.9em",
                                                    borderBottom:
                                                        idx <
                                                        getKeySuggestions()
                                                            .length -
                                                            1
                                                            ? "1px solid var(--background-modifier-border)"
                                                            : "none",
                                                }}
                                                onMouseEnter={() =>
                                                    setSelectedKeySuggestionIndex(
                                                        idx
                                                    )
                                                }
                                            >
                                                {key}
                                            </div>
                                        ))}
                                    </div>
                                )}
                        </div>
                        <div style={{ flex: "1", position: "relative" }}>
                            <input
                                ref={valueInputRef}
                                type="text"
                                value={newPropertyValue}
                                onChange={(e) => {
                                    setNewPropertyValue(e.target.value);
                                    setShowValueDropdown(true);
                                    setSelectedValueSuggestionIndex(0);
                                }}
                                onFocus={() => setShowValueDropdown(true)}
                                onBlur={() =>
                                    setTimeout(
                                        () => setShowValueDropdown(false),
                                        200
                                    )
                                }
                                onKeyDown={(e) => {
                                    const suggestions = getValueSuggestions();
                                    if (e.key === "ArrowDown") {
                                        e.preventDefault();
                                        setSelectedValueSuggestionIndex(
                                            (prev) =>
                                                Math.min(
                                                    prev + 1,
                                                    suggestions.length - 1
                                                )
                                        );
                                    } else if (e.key === "ArrowUp") {
                                        e.preventDefault();
                                        setSelectedValueSuggestionIndex(
                                            (prev) => Math.max(prev - 1, 0)
                                        );
                                    } else if (e.key === "Enter") {
                                        e.preventDefault();
                                        if (
                                            showValueDropdown &&
                                            suggestions.length > 0
                                        ) {
                                            setNewPropertyValue(
                                                suggestions[
                                                    selectedValueSuggestionIndex
                                                ]
                                            );
                                            setShowValueDropdown(false);
                                        } else if (
                                            newPropertyKey &&
                                            newPropertyValue
                                        ) {
                                            setMetadata({
                                                ...metadata,
                                                [newPropertyKey]:
                                                    newPropertyValue,
                                            });
                                            setNewPropertyKey("");
                                            setNewPropertyValue("");
                                            setShowValueDropdown(false);
                                            keyInputRef.current?.focus();
                                        }
                                    }
                                }}
                                placeholder="Value"
                                style={{ width: "100%" }}
                            />
                            {showValueDropdown &&
                                getValueSuggestions().length > 0 && (
                                    <div
                                        style={{
                                            position: "absolute",
                                            top: "100%",
                                            left: 0,
                                            right: 0,
                                            maxHeight: "200px",
                                            overflowY: "auto",
                                            backgroundColor:
                                                "var(--background-primary)",
                                            border: "1px solid var(--background-modifier-border)",
                                            borderRadius: "4px",
                                            zIndex: 1000,
                                            marginTop: "2px",
                                            boxShadow:
                                                "0 4px 12px rgba(0,0,0,0.15)",
                                        }}
                                    >
                                        {getValueSuggestions().map(
                                            (value, idx) => (
                                                <div
                                                    key={value}
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        setNewPropertyValue(
                                                            value
                                                        );
                                                        setShowValueDropdown(
                                                            false
                                                        );
                                                        valueInputRef.current?.focus();
                                                    }}
                                                    style={{
                                                        padding: "8px 12px",
                                                        cursor: "pointer",
                                                        backgroundColor:
                                                            idx ===
                                                            selectedValueSuggestionIndex
                                                                ? "var(--background-modifier-hover)"
                                                                : "transparent",
                                                        fontSize: "0.9em",
                                                        borderBottom:
                                                            idx <
                                                            getValueSuggestions()
                                                                .length -
                                                                1
                                                                ? "1px solid var(--background-modifier-border)"
                                                                : "none",
                                                    }}
                                                    onMouseEnter={() =>
                                                        setSelectedValueSuggestionIndex(
                                                            idx
                                                        )
                                                    }
                                                >
                                                    {value}
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                if (newPropertyKey && newPropertyValue) {
                                    setMetadata({
                                        ...metadata,
                                        [newPropertyKey]: newPropertyValue,
                                    });
                                    setNewPropertyKey("");
                                    setNewPropertyValue("");
                                    keyInputRef.current?.focus();
                                }
                            }}
                            style={{
                                padding: "4px 12px",
                                cursor: "pointer",
                                backgroundColor: "var(--interactive-accent)",
                                border: "none",
                                borderRadius: "4px",
                                color: "var(--text-on-accent)",
                            }}
                        >
                            + Add
                        </button>
                    </div>
                </div>

                <p>
                    <label htmlFor="allDay">All day event </label>
                    <input
                        id="allDay"
                        checked={allDay}
                        onChange={(e) => setAllDay(e.target.checked)}
                        type="checkbox"
                    />
                </p>
                <p>
                    <label htmlFor="recurring">Recurring Event </label>
                    <input
                        id="recurring"
                        checked={isRecurring}
                        onChange={(e) => setIsRecurring(e.target.checked)}
                        type="checkbox"
                    />
                </p>

                {isRecurring && (
                    <>
                        <DaySelect
                            value={daysOfWeek}
                            onChange={setDaysOfWeek}
                        />
                        <p>
                            Starts recurring
                            <input
                                type="date"
                                id="startDate"
                                value={date}
                                // @ts-ignore
                                onChange={makeChangeListener(setDate, (x) => x)}
                            />
                            and stops recurring
                            <input
                                type="date"
                                id="endDate"
                                value={endRecur}
                                onChange={makeChangeListener(
                                    setEndRecur,
                                    (x) => x
                                )}
                            />
                        </p>
                    </>
                )}
                <p>
                    <label htmlFor="task">Task Event </label>
                    <input
                        id="task"
                        checked={isTask}
                        onChange={(e) => {
                            setIsTask(e.target.checked);
                        }}
                        type="checkbox"
                    />
                </p>

                {isTask && (
                    <>
                        <label htmlFor="taskStatus">Complete? </label>
                        <input
                            id="taskStatus"
                            checked={
                                !(complete === false || complete === undefined)
                            }
                            onChange={(e) =>
                                setComplete(
                                    e.target.checked
                                        ? DateTime.now().toISO()
                                        : false
                                )
                            }
                            type="checkbox"
                        />
                    </>
                )}

                <p
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        width: "100%",
                    }}
                >
                    <button type="submit"> Save Event </button>
                    <span>
                        {deleteEvent && (
                            <button
                                type="button"
                                style={{
                                    backgroundColor:
                                        "var(--interactive-normal)",
                                    color: "var(--background-modifier-error)",
                                    borderColor:
                                        "var(--background-modifier-error)",
                                    borderWidth: "1px",
                                    borderStyle: "solid",
                                }}
                                onClick={deleteEvent}
                            >
                                Delete Event
                            </button>
                        )}
                    </span>
                </p>
            </form>
        </>
    );
};
