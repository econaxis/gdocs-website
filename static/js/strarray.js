class StrNode {
    static callers = [];
    constructor(str, index, prefix = "", suffix = "", data_string = "") {
        /**
         * The structure of an StrNode looks like this:
         * prefix + str + data_string + suffix.
         *
         * For example, if we have a deletion operation, then the structure would be:
         * <span class='deletion-operation'> + '' + (string that was deleted) + </span>
         *
         * If we have an insertion operation, then the structure would be:
         * <span class='insertion-operation'> + (string that was inserted) + '' + </span>
         *
         * We have to separate these strings because we don't want the span tags from affecting the order of the characters.
         * Operation diffs rely on the exact order of the characters to be the same to work.
         */

        this.str = str;
        // Represents the start of the string, index in general document.
        this.index = index;
        this.prefix = prefix;

        // Custom string to be output, but doesn't count in index.
        // For example, when we have a deletion operation, we want to show the text that was deleted in the HTMl output,
        // but we don't want that text to take up space in the index. That text should be "0" characters long, and
        // putting that text into data_string allows it to still be rendered to HTMl but have a length of 0.
        this.data_string = data_string;
        this.suffix = suffix;

        this.last_state = [str, index, prefix, data_string, suffix];

        if (str === "" && data_string === "") {
        }
    }

    insert_str(new_str, index, prefix, suffix) {
        this.prefix = prefix;
        this.suffix = suffix;
        this.str = this.str.slice(0, index) + new_str + this.str.slice(index);
        return new_str.length;
    }

    delete_str(start_i, end_i) {
        const prev_length = this.str.length;
        if (end_i === -1) {
            this.str = this.str.slice(0, start_i);
        } else {
            this.str = this.str.slice(0, start_i) + this.str.slice(end_i);
        }

        this.last_state.push("deleted string " + start_i + " " + end_i);
        return this.str.length - prev_length;
    }

    get end_index() {
        return this.index + this.str.length;
    }
}

var perf = {
    queries: 0,
    misses: 0,
    hits: 0,
    skip5: 0,
    skip1: 0,
    query_splits: 0,
    fix_index_mid: 0,
    query_3_splits: 0,
};
// TODO: refactor splitting code into a separate function
class StrArray {
    constructor(str = "") {
        this.buffers = [
            new StrNode(str, 0),
            // Always end the buffer with a newline at infinite index away.
            new StrNode("\n", Number.MAX_SAFE_INTEGER),
        ];

        this.currently_optimizing = false;
        this.max_buffer_length = 150;
    }

    get length() {
        return this.buffers.length;
    }

    last_buffer() {
        if (this.length >= 2) return this.buffers[this.length - 2];
        else return this.buffers[0];
    }

    query_position(index, good_prefix) {
        /**
         * Returns the buffer index (of array this.buffers) and str_offset (what's the character offset of that buffer) that corresponds to index.
         * Also does the auxiliary task of splitting the buffer if it has an incompatible prefix (not equal to good_prefix).
         *
         * index: at what string index to query. (NOT buffer index, pretend as if index represented the character position in the total, concatenated string)
         * good_prefix: if that current buffer already has a prefix set on it, then should we split the buffer up, or should we keep it?
         *       "all-prefixes"   : accept all prefixes
         *       any other string : accept if the preexisting prefix matches good_prefix. Else, split the buffer into three (before index, index, after index)
         */

        // Iterate until we are at the correct StrNode
        const avg_chars_per_buffer = this.last_buffer().index / this.length;
        let next_buffer_index = Math.round(avg_chars_per_buffer * index);
        if (
            next_buffer_index > this.length - 2 ||
            next_buffer_index <= 0 ||
            this.buffers[next_buffer_index].index > index
        ) {
            next_buffer_index = 1;
        }

        let should_skip_more = true;
        const should_jump_by =
            Math.round((index - this.buffers[next_buffer_index].index) / avg_chars_per_buffer / 3) +
            1;

        while (index - this.buffers[next_buffer_index].index >= 0) {
            if (
                should_skip_more &&
                next_buffer_index + should_jump_by < this.length &&
                this.buffers[next_buffer_index + should_jump_by].index <= index
            ) {
                perf.skip5++;
                next_buffer_index += should_jump_by;
            } else {
                perf.skip1++;
                should_skip_more = false;
                next_buffer_index++;
            }

            if (next_buffer_index >= this.length) {
                // In case we somehow mess up and end in this position, then create another buffer.
                // Create new buffer at the last spot.
                const second_last_buf = this.last_buffer();
                this.buffers.splice(this.length - 1, 0, new StrNode("", second_last_buf.end_index));

                next_buffer_index = this.length - 1;
                break;
            }
        }
        let current_buffer_idx = next_buffer_index - 1;
        let cur_buffer = this.buffers[current_buffer_idx];
        let str_offset = index - cur_buffer.index;

        if (
            good_prefix !== "all-prefixes" &&
            cur_buffer.prefix !== "" &&
            cur_buffer.prefix !== good_prefix &&
            cur_buffer.str !== ""
        ) {
            perf.query_splits++;
            const buf_before = new StrNode(
                cur_buffer.str.slice(0, str_offset),
                cur_buffer.index,
                cur_buffer.prefix,
                cur_buffer.suffix
            );
            const buf_added = new StrNode("", buf_before.end_index);
            const buf_after = new StrNode(
                cur_buffer.str.slice(str_offset),
                buf_added.end_index,
                cur_buffer.prefix,
                cur_buffer.suffix,
                cur_buffer.data_string
            );

            const bufs_to_add = [];
            if (buf_before.str) {
                bufs_to_add.push(buf_before);
            }
            bufs_to_add.push(buf_added);
            bufs_to_add.push(buf_after);

            this.buffers.splice(current_buffer_idx, 1, ...bufs_to_add);

            current_buffer_idx += bufs_to_add.length - 2;
            str_offset = 0;
        }

        return {
            buffer_idx: current_buffer_idx,
            str_offset: str_offset
        };
    }

    insert_str_w_annotations(new_str, index) {
        const INSERT_PREFIX = "<span class=\"insertion-operation\">";
        const INSERT_SUFFIX = "</span>";
        let buffer_idx, str_offset;

        const temp = this.query_position(index, INSERT_PREFIX);
        buffer_idx = temp.buffer_idx;
        str_offset = temp.str_offset;

        const fix_index = this.buffers[buffer_idx].insert_str(
            new_str,
            str_offset,
            INSERT_PREFIX,
            INSERT_SUFFIX
        );
        this.fix_index(buffer_idx, fix_index);
    }

    insert_str(new_str, index) {
        const { buffer_idx, str_offset } = this.query_position(index, "all-prefixes");
        const fix_index = this.buffers[buffer_idx].insert_str(new_str, str_offset);
        this.fix_index(buffer_idx, fix_index);
    }

    fix_index(buffer_idx, fix_index) {
        if (fix_index === 0) return;
        const buffer_length = this.length - 1;
        for (let i = buffer_idx + 1; i < buffer_length; i++) {
            this.buffers[i].index += fix_index;
        }
    }

    remove_str(start_i, end_i) {
        if (start_i > end_i) {
            throw "Invalid remove str";
        }
        const indice_s = this.query_position(start_i, "all-prefixes");
        const indice_e = this.query_position(end_i, "all-prefixes");

        if (indice_s.buffer_idx === indice_e.buffer_idx) {
            const fix_index = this.buffers[indice_s.buffer_idx].delete_str(
                indice_s.str_offset,
                indice_e.str_offset
            );
            this.fix_index(indice_s.buffer_idx, fix_index);
        } else if (indice_e.buffer_idx - indice_s.buffer_idx === 1) {
            let fix_index = this.buffers[indice_s.buffer_idx].delete_str(indice_s.str_offset, -1);
            let last_fix_index = this.buffers[indice_e.buffer_idx].delete_str(
                0,
                indice_e.str_offset
            );

            this.buffers[indice_e.buffer_idx].index += fix_index;
            this.fix_index(indice_e.buffer_idx, fix_index + last_fix_index);
        } else {
            let fix_index = this.buffers[indice_s.buffer_idx].delete_str(indice_s.str_offset, -1);
            let mid_fix_index =
                this.buffers[indice_s.buffer_idx + 1].index -
                this.buffers[indice_e.buffer_idx - 1].end_index;

            let last_fix_index = this.buffers[indice_e.buffer_idx].delete_str(
                0,
                indice_e.str_offset
            );

            this.buffers[indice_e.buffer_idx].index += fix_index + mid_fix_index;
            this.fix_index(indice_e.buffer_idx, fix_index + mid_fix_index + last_fix_index);

            this.buffers.splice(
                indice_s.buffer_idx + 1,
                indice_e.buffer_idx - indice_s.buffer_idx - 1
            );
        }
    }

    remove_str_w_annotations(start_i, end_i, deleted_string) {
        /**
         * Removes the characters at start_i to end_i. Annotates that position with the deleted_string (so users can see, in red highlight, what was deleted)
         */
            // TODO: fix error when start_i = 0, buffer_index = 0, we try to access negative index.

        const REMOVE_PREFIX = "<span class='deletion-operation'>";
        const REMOVE_SUFFIX = "</span>";
        this.remove_str(start_i, end_i);
        const remove_index = this.query_position(start_i, REMOVE_PREFIX).buffer_idx;
        this.buffers[remove_index].prefix = REMOVE_PREFIX;
        this.buffers[remove_index].suffix = REMOVE_SUFFIX;
        this.buffers[remove_index].data_string = deleted_string;
    }

    optimize_split_strs(start_i = 0, how_many = 50) {
        /**
         * Iterates through all the buffers and optimizes by joining short buffers, splitting long buffers, and deleting empty buffers.
         * Because this operation might take a long time for slow browsers, this function only runs from 'start_i' for 'how_many' times.
         * Then, it requests an idle callback from the browser for the next chunk to optimize.
         *
         * start_i: what index to start optimizing at.
         * how_many: how many buffers to optimize before stopping.
         */
        const min_len = this.max_buffer_length / 5 + 1;
        const prev_length = this.length;
        let i = start_i;
        for (i = start_i; i < Math.min(this.length - 1, start_i + how_many); i++) {
            if (this.buffers[i].str === "" && this.buffers[i].data_string === "") {
                this.buffers.splice(i, 1);
                i--;
                continue;
            }
            if (this.buffers[i].str.length > this.max_buffer_length) {
                // Split this buffer into two new buffers.
                const cur_node = this.buffers[i];
                const str1 = cur_node.str.substring(0, this.max_buffer_length);
                const str2 = cur_node.str.substring(this.max_buffer_length);

                const node1 = new StrNode(
                    str1,
                    cur_node.index,
                    cur_node.prefix,
                    cur_node.suffix,
                    cur_node.data_string
                );
                const node2 = new StrNode(
                    str2,
                    node1.end_index,
                    cur_node.prefix,
                    cur_node.suffix,
                    cur_node.data_string
                );
                this.buffers.splice(i, 1, node1, node2);
            }
            if (this.buffers[i].prefix) {
                if (
                    this.buffers[i].prefix === this.buffers[i + 1].prefix &&
                    this.buffers[i].str.length + this.buffers[i + 1].str.length <
                    this.max_buffer_length
                ) {
                    this.buffers[i].str += this.buffers[i + 1].str;
                    this.buffers[i].data_string += this.buffers[i + 1].data_string;
                    this.buffers.splice(i + 1, 1);
                    if (i >= 2) i -= 2;
                    continue;
                }
            }
            if (this.buffers[i].str.length === 0 && this.buffers[i].prefix === "") {
                this.buffers.splice(i, 1);
                i -= 1;
                continue;
            }
            if (
                this.buffers[i].str.length <= min_len &&
                i < this.length - 2 &&
                !this.buffers[i + 1].prefix
            ) {
                this.buffers[i].str += this.buffers[i + 1].str;
                this.buffers.splice(i + 1, 1);
                i -= 1;
                continue;
            }
        }

        // Request next idle callback
        if (i < this.length - 2) {
            sleep(200).then(() => {
                window.requestIdleCallback(() => {
                    this.optimize_split_strs(i);
                });
            });
        } else {
            console.log("Optimized from", prev_length, "to", this.length);
            this.currently_optimizing = false;
        }
    }

    concat() {
        // Return the full string by concatenating all the buffers.
        // Each buffer may have annotations that are actually not part of the document and don't count in the index.
        // For each buffer, its string representation is:
        //          prefix + str + data_string + suffix
        let all_strs = "";
        for (const buf of this.buffers) {
            all_strs +=
                buf.prefix +
                buf.str +
                buf.data_string + // Data_string used for when we need some custom data that we don't want as part of prefix/suffix.
                // Also when we want a string to be excluded from the index.
                buf.suffix;
        }
        return all_strs;
    }

    check_index() {
        /**
         * Utility function to check if the index of each buffer is still valid.
         */
        for (let i = 1; i < this.length - 1; i++) {
            if (this.buffers[i].index != this.buffers[i - 1].end_index) {
                throw "err. Index does not match up at " + i;
            }
        }
    }

    clear_annotations() {
        // Clears all prefix/suffix/data_string annotations in the buffer.
        for (let i = 0; i < this.length - 1; i++) {
            if (this.buffers[i].str === "" && this.buffers[i].data_string === "" && i > 0) {
                this.buffers.splice(i, 1);
                i--;
            } else if (!this.buffers[i].prefix) continue;
            else {
                this.buffers[i].prefix = "";
                this.buffers[i].suffix = "";
                this.buffers[i].data_string = "";
            }
        }
    }
}