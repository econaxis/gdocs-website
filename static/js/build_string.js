let strbuf = new StrArray(),
    strbuf_operation_index = 0;
var op; // debug only.
async function build_string(end_index, cancel_id = null) {
    /**
     * Outputs the GDocs document state at specific operation index 'end_index' to the text div.
     *
     * operations: the array of operations
     * end_index: the index of the operation to render
     * cancel_id: handle for checking if the current task should be cancelled. For example, when the user mouses over another
     *      operation when this function is currently running.
     */

    const operations = document.getElementById("word-count-graph").operations;
    strbuf.clear_annotations();
    if (end_index >= operations.length || end_index < 0) {
        console.log(
            `End index ${end_index} larger than operation length ${operations.length}\nSetting end index to correct value.`
        );
        end_index = operations.length - 1;
    }

    async function check_cancel() {
        if (Math.abs(strbuf_operation_index - end_index) % 50 === 0) {
            if (await sleep_check_cancel(5, cancel_id)) {
                console.log("sleep check cancel returned true for", cancel_id);
                return true;
            }
        }
        return false;
    }

    async function walk_forwards() {
        do {
            const cur_op = operations[strbuf_operation_index];
            if (cur_op.type === "is") {
                strbuf.insert_str_w_annotations(cur_op.content, cur_op.start_index);
            } else if (cur_op.type === "ds") {
                strbuf.remove_str_w_annotations(
                    cur_op.start_index,
                    cur_op.end_index,
                    cur_op.content
                );
            }
            strbuf_operation_index++;
        } while (strbuf_operation_index < end_index && !(await check_cancel()));
    }

    async function walk_backwards() {
        do {
            // Decrement index first because we're walking backwards. We haven't applied the operation at strbuf_operation_index yet,
            // So we don't need to reverse the current operation, only all operations before it.
            strbuf_operation_index--;
            const cur_op = operations[strbuf_operation_index];
            if (cur_op.type === "ds") {
                strbuf.insert_str_w_annotations(cur_op.content, cur_op.start_index);
            } else if (cur_op.type === "is") {
                strbuf.remove_str_w_annotations(
                    cur_op.start_index,
                    cur_op.start_index + cur_op.content.length, //TODO: check end_index is similar?
                    cur_op.content
                );
            }
        } while (strbuf_operation_index > end_index && !(await check_cancel()));
    }

    if (end_index > strbuf_operation_index) await walk_forwards();
    else await walk_backwards();

    document.getElementById("primed-notification").innerHTML = strbuf.concat();

    if (!strbuf.currently_optimizing) {
        strbuf.currently_optimizing = true;
        window.requestIdleCallback(() => {
            strbuf.optimize_split_strs();
        });
    }
    op = operations;
}
