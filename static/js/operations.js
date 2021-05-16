class Operation {
    constructor(type, content, start_index, end_index, date, word_count) {
        this.type = type;
        this.content = content;
        this.start_index = start_index;
        this.end_index = end_index;
        this.date = date;
        this.word_count = word_count;
    }

    static make_operations_array (json) {
        const ops_array = [];
        for (const elem of json) {
            ops_array.push(new Operation(elem.type, elem.content, elem.start_index, elem.end_index, elem.date, elem.word_count))
            // console.assert(Math.abs(elem.start_index - elem.end_index) === elem.content.length)
        }
        return ops_array;
    }
}

