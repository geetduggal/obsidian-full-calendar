import { createPlugin } from "@fullcalendar/core";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { LinearView } from "./LinearView";

export default createPlugin({
    views: {
        linear: {
            classNames: ["fc-linear-view"],
            content: function (props: any) {
                const containerEl = document.createElement("div");
                containerEl.className = "linear-container";

                // Render the React component
                ReactDOM.render(
                    React.createElement(LinearView, props),
                    containerEl
                );

                // Return the DOM nodes and cleanup function
                return {
                    domNodes: [containerEl],
                    destroy: function () {
                        ReactDOM.unmountComponentAtNode(containerEl);
                    },
                };
            },
            duration: { years: 1 },
            dateIncrement: { years: 1 },
            dateAlignment: "year",
        },
    },
});
