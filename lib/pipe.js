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

var assert = require("assert");
var events = require("events");
var stream = require("stream");
var util   = require("util");

var consts = require("./consts");
var sealer = require("./sealer");


/*
 * Helper functions
 */

/**
 * Construct the pipe shared state.
 */
function State() {
    this.readerOpen = true; // whether the reader side is still open
    this.writerOpen = true; // whether the writer side is still open
    this.readerEncoding = undefined;
    this.readerPaused = false;
    this.pending = []; // pending buffers to emit (accumulated while paused)
}

/**
 * Emit a data buffer as a reader-side event.
 *
 * Note that the writer side always ensures that what's handed in is a
 * buffer, even if the writer writes a string in a specified encoding
 * which matches the encoding that was set on the reader side. This is
 * done to ensure that there's never an emitted string which couldn't
 * possibly have gone through the specified encoding (e.g. code points
 * `> 0x7f` when the encoding is `"ascii"`).
 */
State.prototype.emitData = function emitData(buf) {
    var encoding = this.readerEncoding;
    this.reader.emit(consts.DATA, encoding ? buf.toString(encoding) : buf);
}

/**
 * Emit the end-of-stream events on the reader side, if appropriate.
 */
State.prototype.emitReaderEnd = function emitReaderEnd() {
    if (this.readerOpen && !this.readerPaused) {
        this.reader.emit(consts.END);
        this.reader.emit(consts.CLOSE);
        this.readerOpen = false;
    }
}


/**
 * Construct the reader end of a pipe.
 */
function Reader(state) {
    stream.Stream.call(this);
    this.pipe = state;
}

util.inherits(Reader, stream.Stream);

Reader.prototype.setEncoding = function setEncoding(encoding) {
    var state = sealer.unseal(this.pipe);

    // The Stream docs (Node 0.6.*) specify the three strings below as
    // the only valid encodings. We also accept `undefined` to mean
    // "reset to reporting buffers".
    switch (encoding) {
        case undefined:
        case consts.UTF8:
        case consts.ASCII:
        case consts.BASE64: {
            state.readerEncoding = encoding;
            break;
        }
        default: {
            throw new Error("Invalid encoding: " + encoding);
        }
    }
}

Reader.prototype.destroy = function destroy() {
    var state = sealer.unseal(this.pipe);

    state.readerOpen = false;
    state.readerPaused = false;
    state.pending = undefined;
}

Reader.prototype.pause = function pause() {
    var state = sealer.unseal(this.pipe);

    if (!state.readerOpen) {
        throw new Error("Closed");
    }

    state.readerPaused = true;
}

Reader.prototype.resume = function resume() {
    var state = sealer.unseal(this.pipe);
    var pending = state.pending;

    if (!state.readerOpen) {
        throw new Error("Closed");
    }

    for (var i = 0; i < pending.length; i++) {
        state.emitData(pending[i]);
    }

    state.pending = [];
    state.readerPaused = false;

    state.writer.emit(consts.DRAIN);

    if (!state.writerOpen) {
        state.emitReaderEnd();
    }
}

Object.defineProperty(
    Reader.prototype,
    "readable",
    {
        get: function() { return sealer.unseal(this.pipe).readerOpen; },
        enumerable: true
    });

Object.freeze(Reader.prototype);


/**
 * Construct the reader end of a pipe.
 */
function Writer(state) {
    events.EventEmitter.call(this);
    this.pipe = state;
}

util.inherits(Writer, events.EventEmitter);

Writer.prototype.write = function write(value, encoding, fd) {
    var state = sealer.unseal(this.pipe);

    if (!state.writerOpen) {
        throw new Error("Closed");
    }

    if (!state.readerOpen) {
        // Just ignore the write if the reader has been closed.
        return true;
    }

    if (typeof value === "string") {
        value = new Buffer(value, encoding);
    } else {
        assert.ok(value instanceof Buffer);
    }

    // We ignore empty buffers, but we still return the proper
    // "success" state based on whether the reader is paused.
    if (value.length === 0) {
        return !state.readerPaused;
    }

    if (state.readerPaused) {
        // Note: We push buffers, not encoded strings, since the
        // reader side might change its requested encoding after the
        // data is queued up.
        state.pending.push(value);
        return false;
    } else {
        state.emitData(value);
        return true;
    }
}

Writer.prototype.end = function end(value, encoding) {
    var state = sealer.unseal(this.pipe);

    if (value !== undefined) {
        this.write(value, encoding);
    }

    if (state.writerOpen) {
        state.emitReaderEnd();
        this.emit(consts.CLOSE);
    }

    state.writerOpen = false;
}

Writer.prototype.destroy = Writer.prototype.end;
Writer.prototype.destroySoon = Writer.prototype.end;

Object.defineProperty(
    Writer.prototype,
    "writable",
    {
        get: function() { return sealer.unseal(this.pipe).writerOpen; },
        enumerable: true
    });

Object.freeze(Writer.prototype);


/*
 * Exported bindings
 */

/**
 * Construct a pipe. The result has bindings for `{reader, writer}` to
 * the two ends of the pipe. The reader is a regular `stream.Stream`
 * to which event listeners may be attached. The writer similarly
 * implements the writable stream protocol and emits the expected
 * events.
 *
 * The optional `paused` argument indicates whether the reader side should
 * start out paused (defaults to `false`).
 */
function Pipe(paused) {
    var state = new State();
    var sealedState = sealer.seal(state);
    this.reader = state.reader = new Reader(sealedState);
    this.writer = state.writer = new Writer(sealedState);

    if (paused) {
        this.reader.pause();
    }
}

Object.freeze(Pipe.prototype);

module.exports = {
    Pipe: Pipe
};
