// Copyright 2012 The Obvious Corporation.

/*
 * A minimal in-process data pipe implementation. Pipes have
 * a write end, which provides the writable stream protocol, and
 * a read end, which emits events.
 */


/*
 * Modules used
 */

"use strict";

var events = require("events");
var stream = require("stream");
var _      = require("underscore");

var consts = require("./consts");


/*
 * Exported bindings
 */

/**
 * Construct a pipette. The result is an object which binds `{reader, writer}`
 * to the two ends of the pipe.
 *
 * The optional `paused` argument indicates whether the reader side should
 * start out paused (defaults to `false`).
 * 
 * The optional `sink` is a convenience, which, if specified, is equivalent
 * to calling `reader().pipe(sink)`.
 */
function create(paused, sink) {
    var reader = {
        get readable() { return readerOpen; },

        destroy:     endReader,
        pause:       pause,
        resume:      resume,
        setEncoding: setEncoding
    };
    _.extend(reader, _.bindAll(new stream.Stream()));

    var writer = {
        get writable() { return writerOpen; },

        destroy:     endWriter,
        destroySoon: endWriter,
        end:         endWriter,
        write:       write
    };
    _.extend(writer, _.bindAll(new events.EventEmitter()));

    var readerOpen = true; // whether the reader side is still open
    var writerOpen = true; // whether the writer side is still open
    var readerEncoding = undefined;
    var readerPaused = false;
    var pending = []; // pending buffers to emit (accumulated while paused)

    if (paused) {
        pause();
    }

    return {
        reader: reader,
        writer: writer
    };

    /**
     * Emit the end-of-stream events.
     */
    function emitEndEvents() {
        if (!readerPaused) {
            reader.emit(consts.END);
            reader.emit(consts.CLOSE);
        }
    }

    /**
     * Writer-side implementation.
     */
    function write(value, encoding, fd) {
        if (!writerOpen) {
            throw new Error("Closed");
        }

        if (!readerOpen) {
            // Just ignore the write if the reader has been closed.
            return true;
        }

        if (encoding !== undefined) {
            value = new Buffer(value, encoding);
        }

        if (readerEncoding) {
            // You might think this is a waste going to a Buffer and
            // then back again, if the given encoding and the
            // specified reader encoding match. However, this suffices
            // to reasonably guarantee that the reader side gets data
            // that could have plausibly been encoded as specified.
            // Just passing through an unmodified string, on the other
            // hand, could cause trouble.
            value = value.toString(readerEncoding);
        }

        if (readerPaused) {
            pending.push(value);
            return false;
        } else {
            reader.emit(consts.DATA, value);
            return true;
        }
    }

    /**
     * Writer-side implementation.
     */
    function endWriter(value, encoding) {
        if (value !== undefined) {
            if (writerOpen) {
                write(value, encoding);
            } else {
                throw new Error("Closed");
            }
        }

        if (writerOpen) {
            writerOpen = false;
            emitEndEvents();
            writer.emit(consts.CLOSE);
        }
    }

    /**
     * Reader-side implementation.
     */
    function setEncoding(encoding) {
        // The Stream docs (Node 0.6.*) specify these three as the
        // only valid encodings.
        switch (encoding) {
            case consts.UTF8:
            case consts.ASCII:
            case consts.BASE64: {
                readerEncoding = encoding;
                break;
            }
            default: {
                throw new Error("Invalid encoding: " + encoding);
            }
        }
    }

    /**
     * Reader-side implementation.
     */
    function endReader() {
        readerOpen = false;
        pending = undefined;
    }

    /**
     * Reader-side implementation.
     */
    function pause() {
        if (!readerOpen) {
            throw new Error("Closed");
        }

        readerPaused = true;
    }

    /**
     * Reader-side implementation.
     */
    function resume() {
        if (!readerOpen) {
            throw new Error("Closed");
        }

        for (var i = 0; i < pending.length; i++) {
            reader.emit(consts.DATA, pending[i]);
        }

        writer.emit(consts.DRAIN);

        if (writerClosed) {
            emitEndEvents();
        }

        pending = [];
        readerPaused = false;
    }
}

module.exports = {
    create: create
};
