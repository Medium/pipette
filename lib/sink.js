// Copyright 2012 The Obvious Corporation.

/*
 * An in-memory collector for data events.
 */


/*
 * Modules used
 */

"use strict";

var assert = require("assert");
var stream = require("stream");
var util   = require("util");

var consts = require("./consts");
var sealer = require("./sealer");


/*
 * Module variables
 */

/**
 * special error value indicating that there was in fact no error. This
 * is used instead of `undefined` to disambiguate the no-error case from
 * the case of an error receieved but with an `undefined` payload.
 */
var NO_ERROR = [ "no-error" ];


/*
 * Helper functions
 */

/**
 * Construct a Sink state object.
 */
function State(emitter, source) {
    assert.ok(source !== undefined, "Missing source.");

    if (typeof source.on !== "function") {
        throw new Error("Source not an EventEmitter.");
    }

    this.emitter = emitter;
    this.source = source;
    this.paused = false;
    this.buffers = []; // incrementally collected buffers
    this.data = undefined; // final combined data
    this.error = NO_ERROR; // error payload that terminated the stream
    this.ready = false; // ready to emit?
    this.ended = false;

    // We `bind()` the event listener callback methods, so that they
    // get an appropriate `this` when they're called during event
    // emission.
    this.onCloseOrEnd = this.onCloseOrEnd.bind(this);
    this.onData = this.onData.bind(this);
    this.onError = this.onError.bind(this);

    source.on(consts.CLOSE, this.onCloseOrEnd);
    source.on(consts.DATA, this.onData);
    source.on(consts.END, this.onCloseOrEnd);
    source.on(consts.ERROR, this.onError);
}

State.prototype.destroy = function destroy() {
    var source = this.source;

    source.removeListener(consts.CLOSE, this.onCloseOrEnd);
    source.removeListener(consts.DATA, this.onData);
    source.removeListener(consts.END, this.onCloseOrEnd);
    source.removeListener(consts.ERROR, this.onError);

    this.emitter = undefined;
    this.paused = false;
    this.buffers = undefined;
    this.data = undefined;
    this.error = undefined;
    this.ready = false;
    this.ended = true;
};

/**
 * Construct the final data value for this instance, and indicate that
 * the instance is ready to emit.
 */
State.prototype.makeData = function makeData() {
    var buffers = this.buffers;

    var totalLength = 0;
    for (var i = 0; i < buffers.length; i++) {
        totalLength += buffers[i].length;
    }

    // Only set this.data if there were any non-empty data events.
    var data = undefined;
    if (totalLength !== 0) {
        if (buffers.length === 1) {
            // Easy case!
            data = buffers[0];
        } else {
            // Hard case: We have to actually combine all the data.
            data = new Buffer(totalLength);
            var at = 0;
            for (var i = 0; i < buffers.length; i++) {
                var one = buffers[i];
	        one.copy(data, at);
	        at += one.length;
            }
        }
    }

    // FIXME: Handle encodings.
    this.data = data;
    this.buffers = undefined; // Prevents extra data events from messing us up.
    this.ready = true;
}

/**
 * Emit the end-of-stream events for this instance.
 */
State.prototype.emitAllEvents = function emitAllEvents() {
    // Capture these variables up-front, to guard against the instance
    // getting `destroy()`ed by one of the event callbacks.
    var emitter = this.emitter;
    var data = this.data;
    var error = this.error;

    if (!emitter) {
        return;
    }

    if (data) {
        emitter.emit(consts.DATA, data);
    }

    if (error === NO_ERROR) {
        emitter.emit(consts.END);
        emitter.emit(consts.CLOSE);
    } else {
        emitter.emit(consts.ERROR, error);
    }

    this.ended = true;
}

State.prototype.isReadable = function isReadable() {
    return !this.ended;
}

State.prototype.pause = function pause() {
    if (!this.ended) {
        this.paused = true;
    }
};

State.prototype.resume = function resume() {
    if (!this.paused) {
        return;
    }

    this.paused = false;
    if (this.ready) {
        this.emitAllEvents();
    }
};

State.prototype.onCloseOrEnd = function onCloseOrEnd() {
    if (this.ended || this.ready) {
        return;
    }

    this.makeData();

    if (!this.paused) {
        this.emitAllEvents();
    }
}

State.prototype.onData = function onData(data) {
    if (this.ended || this.ready) {
        return;
    }

    // TODO: Correctly handle incoming encoding.
    if (typeof data === "string") {
        data = new Buffer(data);
    }

    this.buffers.push(data);
}

State.prototype.onError = function onError(error) {
    if (this.ended || this.ready) {
        return;
    }

    this.error = error;
    this.makeData();

    if (!this.paused) {
        this.emitAllEvents();
    }
}


/*
 * Exported bindings
 */

/**
 * Construct a Sink instance, which collects data events coming from the
 * indicated source stream. Sink instances are in turn instances of
 * `stream.Stream`.
 */
function Sink(source) {
    stream.Stream.call(this);
    this.sink = sealer.seal(new State(this, source));
}

util.inherits(Sink, stream.Stream);

Sink.prototype.destroy = function destroy() {
    sealer.unseal(this.sink).destroy();
};

Sink.prototype.pause = function pause() {
    sealer.unseal(this.sink).pause();
};

Sink.prototype.resume = function resume() {
    sealer.unseal(this.sink).resume();
};

Sink.prototype.setEncoding = function setEncoding(name) {
    // FIXME: Handle encoding.
};

Object.defineProperty(
    Sink.prototype,
    "readable",
    {
        get: function() { return sealer.unseal(this.sink).isReadable(); },
        enumerable: true
    });

/**
 * Sets the incoming encoding. This is how to interpret strings that are
 * received as the payloads of `data` events.
 */
Sink.prototype.setIncomingEncoding = function setIncomingEncoding(name) {
    // FIXME: Handle encoding.
}

/**
 * Gets the final combined data of the instance, if available.
 */
Sink.prototype.getData = function getData() {
    return sealer.unseal(this.sink).data;
}

/**
 * Gets the error that ended the upstream data, if any.
 */
Sink.prototype.getError = function getError() {
    return sealer.unseal(this.sink).error;
}

/**
 * Gets whether or not the stream ended with an error.
 */
Sink.prototype.gotError = function gotError() {
    return sealer.unseal(this.sink).error !== NO_ERROR;
}

Object.freeze(Sink.prototype);

module.exports = {
    Sink: Sink
};
