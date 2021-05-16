"use strict";

// Use linkedlist instead of pure array to better control memory,

const GRID_LINE_COLOR = "#272078", // Color of the session ticks
    SESSION_SEPARATOR_WIDTH = 2; // Width in pixels of the separators themselves.

let g_word_count_graph, // DOM element corresponding to Plotly word count graph.
    // Also where we attach our array of all the Google Docs operations.
    g_date_progress_bar, // The progress bar below the graph. Changes on hover.
    mouse_is_out = true, // Whether the mouse is in the frame. Assures that text rendering only happens if mouse is still in the frame.
    build_string_in_progress = false, // Basic *async mutex. Prevents build_string from running twice if user moves mouse too much, triggering two callback events.
    last_task = undefined;

g_word_count_graph = document.getElementById("word-count-graph");
g_date_progress_bar = document.querySelector(
    "#date-progress-bar>.progress-bar"
);

function write_dates_to_dom(new_date) {
    const localestring = new Date(
        new_date
    ).toLocaleString();
    g_date_progress_bar.previousElementSibling.innerText = `${localestring}`;
    document.getElementById("document-state-date").innerText = localestring;
}

function setup_graph_callbacks(g_word_count_graph, g_date_progress_bar) {
    // Setups the hover callback.
    // For each hover event (plotly_hover), we have to update:
    //      The progress bar value (to correspond to the new date that's hovered on)
    //      The text at that hovered point. Render after a delay
    const primed_notification = document.getElementById("primed-notification");

    // Add hovering callback
    g_word_count_graph.on("plotly_hover", function (event_data) {
        mouse_is_out = false;

        // See full event data documentation: https://plotly.com/javascript/hover-events/#capturing-hover-events:-data
        const hovered_point_x = event_data.points[0].x;
        // Set the progress bar to the corresponding date of hover.
        const date = g_word_count_graph.operations[hovered_point_x].date;
        const bar_fraction =
            (date - g_date_progress_bar.custom_min_date) /
            (g_date_progress_bar.custom_max_date -
                g_date_progress_bar.custom_min_date);
        g_date_progress_bar.style.transform = `scaleX(${bar_fraction})`;
        write_dates_to_dom(date)

        cancel_task(last_task);
        last_task = new_cancellable_func_id();

        const last_task_local = last_task;
        primed_notification.classList.add("loading");
        sleep(200)
            .then(() => {
                if (check_cancel(last_task_local)) {
                    console.debug("cancel task ", last_task_local);
                    return new Promise((resolve) => {
                        resolve("not-called");
                    });
                }
                if (mouse_is_out) {
                    return new Promise((resolve) => {
                        resolve("remove-loading");
                    });
                }
                console.debug("running task", last_task_local);
                return build_string(
                    hovered_point_x,
                    last_task_local
                ).then(() => {
                    return "remove-loading";
                });
            })
            .then((msg) => {
                if (msg === "remove-loading") {
                    primed_notification.classList.remove("loading");
                }
            });
    });
}

function date_to_string(unix_timestamp, precision) {
    // Precision: string. Possibilities are "day", "minute," "second"
    unix_timestamp = new Date(unix_timestamp);
    if (precision === "second") {
        return unix_timestamp.toLocaleString(undefined, {
            timeStyle: "medium",
        });
    } else if (precision === "minute") {
        return unix_timestamp.toLocaleString(undefined, {
            timeStyle: "short",
        });
    } else if (precision === "day") {
        return unix_timestamp.toLocaleString(undefined, {
            dateStyle: "short",
        });
    }
}

function calculate_axis_intervals(
    operations,
    intervals = [
        // Default intervals. We test all of them
        24 * 60 * 60 * 1000,
        4 * 60 * 60 * 1000,
        2 * 60 * 60 * 1000,
        60 * 60 * 1000,
        30 * 60 * 1000,
        5 * 60 * 1000,
        60 * 1000,
    ]
) {
    // Operations: an array of objects with the properties "date"
    // Interval: The interval where we split two separate writing sessions in milliseconds
    //      Default value: 1 minute

    if (!Array.isArray(intervals)) {
        intervals = [intervals];
    }

    const MIN_NUM_SESSIONS = 5;
    let ticktext = [],
        tickvals = [],
        uniform_tickvals = [],
        uniform_ticktext = [];
    const find_num_sessions = (SESSION_INTERVAL) => {
        const _tickvals = [];
        for (let i = 1; i < operations.length; i++) {
            // If the difference in operation times is more than 2 hours, that means a new writing session has started.
            if (
                operations[i].date - operations[i - 1].date >
                SESSION_INTERVAL
            ) {
                _tickvals.push(i);
            }
        }
        return _tickvals;
    };

    let applied_interval;
    for (const interval of intervals) {
        // TODO: optimize by checking whether max(date) - min(date) larger than interval.
        tickvals = find_num_sessions(interval);
        applied_interval = interval;
        if (tickvals.length >= MIN_NUM_SESSIONS) {
            break;
        }
    }

    // The ticks array should have a good number of sessions (satisfying the num_session_range requirement).
    // These ticks correspond to new sessions
    let precision = "minute";

    if (applied_interval <= 60 * 1000) precision = "second";
    else if (applied_interval >= 24 * 60 * 60 * 1000) precision = "day";

    for (let i = 0; i < tickvals.length; i++) {
        ticktext.push(`(${i})`);
    }

    // Add uniform tick values
    const TICK_INTERVAL = operations.length / 10;
    let i = 0;
    while (i < operations.length) {
        const i_int = Math.floor(i);
        uniform_tickvals.push(i_int);
        uniform_ticktext.push(
            date_to_string(operations[i_int].date, precision)
        );
        i += TICK_INTERVAL;
    }
    return {
        ticktext: ticktext,
        tickvals: tickvals,
        uniform_ticktext: uniform_ticktext,
        uniform_tickvals: uniform_tickvals,
    };
}

function fix_up_dates(operations) {
    for (let index = 0; index < operations.length; index++) {
        if (operations[index].date < 10000000000) {
            // "Migration" to new API. Time should be in milliseconds
            // If time is in seconds, it'll be less than 100..., so we multiply it by 1000 to convert.
            operations[index].date *= 1000;
        }
    }
}

function convert_operations_to_traces(operations, num_markers = 1000) {
    const word_count_trace = {
        x: [],
        y: [],
    };

    if (num_markers > 200) word_count_trace.mode = "lines";
    else word_count_trace.mode = "lines+markers";

    const index_increment_interval = Math.ceil(operations.length / num_markers);
    let index = 0;
    while (index < operations.length) {
        // Since the x-axis is the index of the revision, the word count will be contionuous and smooth graph. It'll represent how long the user spent *writing* the document, rather than the actual date/time when the edits took place.
        const index_i = Math.floor(index);
        word_count_trace.x.push(index_i);
        word_count_trace.y.push(operations[index_i].word_count);
        index += index_increment_interval;
    }
    return word_count_trace;
}

function setup_date_slider(operations, slider_element, intervals) {
    // Initialize the min/max dates for the progress bar
    // The first trace is the word count trace (word_count_trace). The second trace (at index 1) is date_markers. Order matters!
    // We only want the first trace.
    slider_element.custom_min_date = operations[0].date;
    slider_element.custom_max_date = operations[operations.length - 1].date;

    for (let i = 0; i < intervals.tickvals.length; i++) {
        const operation_index = intervals.tickvals[i];
        const current_ticktext = intervals.ticktext[i];
        const date = operations[operation_index].date;
        const left_offset_percent =
            ((date - slider_element.custom_min_date) /
                (slider_element.custom_max_date -
                    slider_element.custom_min_date)) *
            100;

        slider_element.insertAdjacentHTML(
            "afterend",
            `
<div class = "progress-bar-ticks" 
        style = "
            left: ${left_offset_percent}%;
            background-color: ${GRID_LINE_COLOR};
            width: ${SESSION_SEPARATOR_WIDTH}px;
        ">
        <span>${current_ticktext}</span>
</div>
            `
        );
    }
}

function draw_graph(operations_response, name = "Sample Graph") {
    g_word_count_graph.operations = operations_response;

    const layout = {
        title: name,
        margin: {
            l: 15,
            r: 15,
        },
        yaxis: {
            // Disallow zooming on the y range. It's not necessary for our visualization.
            fixedrange: true,
            title: "Word Count",
            ticks: "",
            showticklabels: false,
            showline: false,
        },
        xaxis: {
            // Uniform ticks
            title: "placeholder (to be filled in later by JS)",
            // The number that the tick occurs (corresponds to revision number as we're using revision index as the main axis)
            tickvals: [],
            // The text to be shown
            ticktext: [],
            tickangle: 45,
            side: "bottom",
            showspikes: true,
            spikemode: "toaxis",
            spikethickness: 2,
            zeroline: false,
        },
        xaxis2: {
            // Non-uniform, per session ticks
            gridwidth: SESSION_SEPARATOR_WIDTH,
            gridcolor: GRID_LINE_COLOR,
            matches: "x",
            overlaying: "x",
            side: "top",
            tickfont: {
                color: GRID_LINE_COLOR,
            },
            tickangle: 0,
            zeroline: false,
        },

        spikedistance: -1,
    };

    // Placeholder trace for xaxis2 - for the session labels
    const fake_placeholder_trace = {
        x: [],
        y: [],
        xaxis: "x2",
    };
    // Checks if dates are in units of seconds, and change it to milliseconds.
    fix_up_dates(operations_response);

    const axis_intervals = calculate_axis_intervals(operations_response);
    setup_date_slider(operations_response, g_date_progress_bar, axis_intervals);

    /*
     * The difference between xaxis2 and xaxis is that
     *      xaxis: for uniform ticks so users get context of what date they are currently selecting.
     *      xaxis2: for session based tick. Every tick represents a new session and corresponds to the date slider
     *          bar at the bottom. Blue color and thicker than normal xaxis tick.
     */
    // Assign elements from axis_intervals to layout
    layout.xaxis2.tickvals = axis_intervals.tickvals;
    layout.xaxis2.ticktext = axis_intervals.ticktext;

    layout.xaxis.tickvals = axis_intervals.uniform_tickvals;
    layout.xaxis.ticktext = axis_intervals.uniform_ticktext;

    const word_count_trace = convert_operations_to_traces(operations_response);
    word_count_trace.xaxis = "x";
    word_count_trace.name = "Word Count";

    // Setup title for date.
    const formatted_date_range = {
        start_date: new Date(
            g_date_progress_bar.custom_min_date
        ).toLocaleDateString(),
        end_date: new Date(
            g_date_progress_bar.custom_max_date
        ).toLocaleDateString(),
    };
    layout.xaxis.title = `Writing Sessions from ${formatted_date_range.start_date} to ${formatted_date_range.end_date}`;

    Plotly.react(
        g_word_count_graph,
        [word_count_trace, fake_placeholder_trace],
        layout
    );

    setup_graph_callbacks(g_word_count_graph, g_date_progress_bar);


    // Default content that's displayed when user first loads the page. Render the latest state of document.
    build_string(-1);


}

window.addEventListener("DOMContentLoaded", function () {
    // Pull data and load it as Plotly graph
    fetch("static/js/test_data_obfuscated.json")
        .then((response) => {
            if (!response.ok) throw "HTTP Err: " + response;
            return response.json();
        })
        .then((json) => {
            json = Operation.make_operations_array(json);

            draw_graph(json, "Sample Word Count Graph");
        });

    // Sometimes the server sleeps. Prime the server on first page load.
    fetch(API_URL + "/prime")
        .then((resp) => resp.text())
        .then((text) => {
            console.log(text);
        });

    // Setup interval selection event handler
    // Must happen after draw_graph() because it sets up the globals required (word_count_graph/date_progress_bar)
    // document
    //     .getElementById("time-interval-selector")
    //     .addEventListener("change", function handle_interval_change(evt) {
    //         const operations = g_word_count_graph.operations;
    //         // Eval the multiplication. Should probably multiply it out by hand and precompute.
    //         const new_interval = eval(evt.target.value);
    //         console.log("updating to new interval: ", new_interval);

    //         const axis_intervals = calculate_axis_intervals(
    //             operations,
    //             new_interval
    //         );

    //         // Have to delete old intervals from the date slider. We're adding new, updated ones.
    //         document.querySelectorAll(".progress-bar-ticks").forEach((elem) => {
    //             elem.remove();
    //         });
    //         setup_date_slider(operations, g_date_progress_bar, axis_intervals);

    //         const updated_layout = {};
    //         // // Assign elements from axis_intervals to layout
    //         updated_layout["xaxis2.tickvals"] = axis_intervals.tickvals;
    //         // For the ticktext on the graph, we only want the short id (1), (2), (3), ...
    //         // instead of the whole tick text string, like (1) 12:57 pm.
    //         updated_layout[
    //             "xaxis2.ticktext"
    //         ] = axis_intervals.ticktext.map((str) => str.slice(0, 3));
    //         Plotly.relayout(g_word_count_graph, updated_layout);
    //     });

    // On mouse leave, cancel the event
    g_word_count_graph.addEventListener("mouseout", () => {
        mouse_is_out = true;
    });
    g_word_count_graph.addEventListener("mouseenter", () => {
        mouse_is_out = false;
    });

    var popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'))
    var popoverList = popoverTriggerList.map(function (popoverTriggerEl) {
        return new bootstrap.Popover(popoverTriggerEl)
    })


});
