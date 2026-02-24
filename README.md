# Full Calendar Plugin

![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22obsidian-full-calendar%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json)

Keep your calendar in your vault! This plugin integrates the [FullCalendar](https://github.com/fullcalendar/fullcalendar) library into your Obsidian Vault so that you can keep your ever-changing daily schedule and special events and plans alongside your tasks and notes, and link freely between all of them. Each event is stored as a separate note with special frontmatter so you can take notes, form connections and add context to any event on your calendar.

Full Calendar can pull events from frontmatter on notes, or from event lists in daily notes. Full Calendar also supports read-only ICS and CalDAV remote calendars.

You can find the full documentation [here](https://obsidian-community.github.io/obsidian-full-calendar/)!

![Sample Calendar](https://raw.githubusercontent.com/obsidian-community/obsidian-full-calendar/main/docs/assets/sample-calendar.png)

## Key Features

### Year View
A compact BirdsEye-style calendar that displays an entire year at a glance. Each month is shown as a row with days as individual boxes, making it easy to:
- Visualize patterns and scheduling conflicts across the year
- Plan long-term projects and commitments
- Drag and drop events between days
- Create multi-day events by click-and-drag selection
- Filter events by custom properties

### Property-Based Event Coloring
Events are automatically colored based on configurable custom properties (default: folder, box, shelf). This provides:
- Visual grouping of related events
- Consistent colors across all calendar views
- Easy identification of event categories at a glance
- Configurable property priority order in settings

### Smart Filtering
Filter events in year view by any custom property:
- Multiple filters with OR logic
- Autocomplete suggestions based on existing values
- Real-time event count display
- Wiki-link support in filter values
- Persistent filter state across sessions

### Mobile-Optimized
Full support for mobile devices with:
- Sticky navigation and filter controls
- Touch-optimized event interaction
- Responsive layout for small screens
- Horizontal scrolling for month views

### Streamlined Event Creation
Choose between two workflows in settings:
- **Direct File Creation** (default): Opens events directly in a new pane for immediate editing
- **Modal Editing**: Traditional form-based event creation with property autocomplete

### Event Management
- Drag-and-drop event rescheduling across all views
- Multi-day event support with visual spanning
- Property editor with autocomplete and default values
- Wiki-link support in event properties
- Automatic YAML frontmatter quoting for special characters

The FullCalendar library is released under the [MIT license](https://github.com/fullcalendar/fullcalendar/blob/master/LICENSE.txt) by [Adam Shaw](https://github.com/arshaw). It's an awesome piece of work, and it would not have been possible to make something like this plugin so easily without it.

[![Support me on Ko-Fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/M4M1GQ84A)

## Installation

Full Calendar is available from the Obsidian Community Plugins list -- just search for "Full Calendar" paste this link into your browser: `obsidian://show-plugin?id=obsidian-full-calendar`.

### Manual Installation

You can also head over to the [releases page](https://github.com/obsidian-community/obsidian-full-calendar/releases) and unzip the latest release inside of the `.obsidian/plugins` directory inside your vault.
