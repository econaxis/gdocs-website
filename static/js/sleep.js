function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

let cur_index = 0;
const cancelled = new Map();

function new_cancellable_func_id() {
    return ++cur_index;
}

async function sleep_check_cancel(ms, cancel_id) {
    if (cancelled.has(cancel_id)) {
        console.log("Cancelling task ", cancel_id);
        return true;
    }
    await sleep(ms);
    return false;
}

function check_cancel(cancel_id) {
    return cancelled.has(cancel_id);
}

function cancel_task(cancel_id) {
    cancelled.set(cancel_id, true);
}
