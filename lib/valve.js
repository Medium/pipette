// Copyright 2012 The Obvious Corporation.

/*
 * A simple stream reader valve, for reliably capturing stream events
 * across tick boundaries.
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
 * Helper functions
 */

/**
 * Construct a Valve state object.
 */
function State(emitter, source, paused) {
    this.emitter = emitter;
    this.source  = source;
    this.paused  = (paused === undefined) ? true : !!paused;
    this.buffer  = [];
    this.ended   = false;
    this.closed  = false;

    this.onClose = this.onClose.bind(this);
    this.onData  = this.onData.bind(this);
    this.onEnd   = this.onEnd.bind(this);
    this.onError = this.onError.bind(this);

    if (typeof source.on !== "function") {
        throw new Error("Source not an EventEmitter.");
    }

    source.on(consts.CLOSE, this.onClose);
    source.on(consts.DATA,  this.onData);
    source.on(consts.END,   this.onEnd);
    source.on(consts.ERROR, this.onError);
}

State.prototype.destroy = function destroy() {
    var source = this.source;

    source.removeListener(consts.CLOSE, this.onClose);
    source.removeListener(consts.DATA,  this.onData);
    source.removeListener(consts.END,   this.onEnd);
    source.removeListener(consts.ERROR, this.onError);

    this.paused  = true;
    this.buffer  = undefined;
    this.emitter = undefined;
    this.ended   = true;
    this.closed  = true;
};

State.prototype.isReadable = function isReadable() {
    return !this.ended;
}

State.prototype.pause = function pause() {
    this.paused = true;
};

State.prototype.resume = function resume() {
    if (!this.paused) {
        return;
    }

    this.paused = false;

    var buf = this.buffer;
    for (var i = 0; i < buf.length; i++) {
        var one = buf[i];
        one.func(one.arg);
    }
};

State.prototype.onClose = function onClose() {
    if (this.paused) {
        this.buffer.push({ func: this.onClose });
    } else if (this.emitter && !this.closed) {
        this.emitter.emit(consts.CLOSE);
        this.ended = true;
        this.closed = true;
    }
}

State.prototype.onData = function onData(data) {
    if (this.paused) {
        this.buffer.push({ func: this.onData, arg: data });
    } else if (!this.ended) {
        this.emitter.emit(consts.DATA, data);
    }
}

State.prototype.onEnd = function onEnd() {
    if (this.paused) {
        this.buffer.push({ func: this.onEnd });
    } else if (this.emitter && !this.ended) {
        this.emitter.emit(consts.END);
        this.ended = true;
    }
}

State.prototype.onError = function onError(error) {
    if (this.paused) {
        this.buffer.push({ func: this.onError, arg: error });
    } else if (this.emitter && !this.ended) {
        this.emitter.emit(consts.ERROR, error);
        this.ended = true;
        this.closed = true;
    }
}


/*
 * Exported bindings
 */

/**
 * Construct a Valve instance, which relays events coming from the
 * indicated source stream. Valve instances are in turn instances of
 * `stream.Stream`.
 *
 * The optional `paused` argument indicates whether the valve starts
 * out paused (that is, buffering events). It defaults to `true`
 * (because that's the expected primary use case).
 */
function Valve(source, paused) {
    assert.ok(source !== undefined, "Missing source.");

    stream.Stream.call(this);
    this.valve = sealer.seal(new State(this, source, paused));
}

util.inherits(Valve, stream.Stream);

Valve.prototype.destroy = function destroy() {
    sealer.unseal(this.valve).destroy();
};

Valve.prototype.pause = function pause() {
    sealer.unseal(this.valve).pause();
};

Valve.prototype.resume = function resume() {
    sealer.unseal(this.valve).resume();
};

Valve.prototype.setEncoding = function setEncoding() {
    throw new Error("setEncoding() not supported");
};

Object.defineProperty(
    Valve.prototype,
    "readable",
    {
        get: function() { return sealer.unseal(this.valve).isReadable(); },
        enumerable: true
    });

Object.freeze(Valve.prototype);

module.exports = {
    Valve: Valve
};
