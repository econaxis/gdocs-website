
class StrArrayNaive {
    constructor() {
        this.str = "";
        this.currently_optimizing = false;
    }

    insert_str_w_annotations(new_str, index, prefix, suffix) {
        this.str = this.str.slice(0, index) + new_str + this.str.slice(index);
    }

    remove_str(start_i, end_i) {
        this.str = this.str.slice(0, start_i) + this.str.slice(end_i);
    }

    remove_str_w_annotations(start_i, end_i, prefix, new_str, suffix) {
        // TODO: fix error when start_i = 0, buffer_index = 0, we try to access negative index.
        this.remove_str(start_i, end_i);
    }

    optimize_split_strs() {}
    concat() {
        return this.str;
    }

    clear_annotations() {}
}

function no_annotation(strbuf) {
    strbuf.remove_str_w_annotations = strbuf.remove_str;
    strbuf.insert_str_w_annotations = strbuf.insert_str;
}

async function test_naive() {
    strbuf = new StrArrayNaive();
    await perf_test();
    strbuf = new StrArray();
    await perf_test();
}

async function perf_test() {
    var wcg = document.getElementById("word-count-graph");
    var repeats = 500;
    let times = [];

    var _sleep_check_cancel = sleep_check_cancel;
    sleep_check_cancel = async function () {};
    while (repeats--) {
        var start = performance.now();
        await build_string(
            Math.floor(Math.random() * (wcg.operations.length - 2))
        );
        times.push(performance.now() - start);
        await sleep(150);
        if (repeats % 30 === 0) {
            console.log(repeats);
            await sleep(2000);
        }
        if (repeats % 100 === 0) {
            times = times.sort((a, b) => a - b);
            const tl = times.length;
            console.log(
                "Time per iter: ",
                times[Math.round(tl / 2)],
                times[Math.round(tl * 0.25)],
                times[Math.round(tl * 0.75)]
            );
        }
    }
}




/*
var test1, s, time_record;
function test_performance() {
    test1 = new StrArray();
    const _repeats = 1000;

    const test_string =
        "ABC123 Lorem Ipsum  DormABC123 Lorem Ipsum DormABC123 Lorem Ipsum DormABC123 Lorem Ipsum Dorm Test 123\n";

    let repeats = _repeats;
    function shortbuflen(buflen, split_interv = 50) {
        test1 = new StrArray();
        let start = performance.now();
        repeats = _repeats;
        while (repeats--) {
            const idx = Math.floor(Math.random() * test1.length);
            test1.insert_str(test_string, idx);
            if (repeats % split_interv == 0) test1.optimize_split_strs(buflen);
        }
        let intervals = 0;
        while (intervals < 500) {
            const si = Math.floor(Math.random() * (test1.length - 30)) + 15;
            let ei = si + Math.floor(Math.random() * 3);
            if (ei >= test1.length) ei = test1.length - 3;
            test1.remove_str(si, ei);
            if (++intervals % split_interv === 0) {
                test1.optimize_split_strs(buflen);
            }
        }
        s = test1.concat();

        // console.log(
        //     ` Buflen: ${buflen} Time: ${performance.now() - start} Num bufs: ${
        //         test1.buffers.length
        //     }, Split Interv: ${split_interv}`
        // );
        return performance.now() - start;
    }
    // Warm up
    const prev_console = console.log;
    console.log = (s) => {};
    shortbuflen(100);
    shortbuflen(100);
    shortbuflen(100);
    console.log = prev_console;
    shortbuflen(100);

    time_record = {};
    for (let buflen = 100; buflen <= 100000; buflen += 300) {
        let time = 0;
        time_record[buflen] = [];
        for (let i = 0; i < 2000; i++) {
            time_record[buflen].push(shortbuflen(buflen, 150));
        }
        console.log(
            `Buflen: ${buflen}`
        );
    }

    console.log("Tests passed");
}

function test_correctness() {
    test = new StrArray();
    test1 = new StrArray();

    const test_string = "ABC123 Lorem Ipsum Dormet Test 123\n";
    let repeats = 1000;
    while (repeats--) {
        const idx = Math.floor(Math.random() * test.length);
        test.insert_str(test_string, idx);
        test1.insert_str(test_string, idx);
        if (repeats % 50 == 0) test1.optimize_split_strs(50);
        console.assert(test.length == test1.length);
        console.assert(test.concat() === test1.concat());
    }
    console.log("Done string insertion");
    while (test.length > 500) {
        console.assert(test.length === test1.length);
        const si = Math.floor(Math.random() * test.length);
        let ei = si + Math.floor(Math.random() * 10);
        if (ei >= test.length) ei = test.length - 1;
        test.remove_str(si, ei);
        test1.remove_str(si, ei);
        if (test.length % 100 === 0) {
            test1.optimize_split_strs(Math.floor(Math.random() * 50 + 20));
        }
        if (test.length !== test1.length || test.concat() !== test1.concat()) {
            console.log("err ", test, test1);
        }
    }
    console.log("Tests passed");
}
*/
