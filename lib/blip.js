// Copyright 2012 The Obvious Corporation.

/*
 * A readable stream that exists to emit a single data event.
 */


/*
 * Modules used
 */

"use strict";

var stream = require("stream");
var util   = require("util");

var consts = require("./consts");
var sealer = require("./sealer");


/*
 * Helper functions
 */

/**
 * Construct a Blip state object.
 */
function State(emitter, data) {
    this.emitter  = emitter;
    this.data     = data;
    this.paused   = true;
    this.readable = true;

    if ((data !== undefined) &&
        (typeof data !== "string") &&
        !Buffer.isBuffer(data)) {
        throw new Error("Data not a string or buffer.");
    }
}

State.prototype.destroy = function destroy() {
    this.paused   = false;
    this.emitter  = undefined;
    this.data     = undefined;
    this.paused   = false;
    this.readable = false;
};

State.prototype.isReadable = function isReadable() {
    return this.readable;
}

State.prototype.resume = function resume() {
    if (!this.paused) {
        return;
    }

    var data = this.data;

    this.paused = false;

    if (data !== undefined) {
        this.emitter.emit(consts.DATA, data);
    }

    this.emitter.emit(consts.END);
    this.emitter.emit(consts.CLOSE);
    this.data = undefined;
    this.readable = false;
};


/*
 * Exported bindings
 */

/**
 * Construct a Blip instance, which emits a single `data` event followed
 * by `end` and `close` events. Blip instances are in turn instances of
 * `stream.Stream`.
 *
 * The `data` argument must be a string or buffer to emit as data.
 *
 * Blip instances always start out paused, because there is no point
 * in having them start out running, as their events would immediately
 * get lost.
 */
function Blip(data) {
    stream.Stream.call(this);
    this.blip = sealer.seal(new State(this, data));
}

util.inherits(Blip, stream.Stream);

Blip.prototype.destroy = function destroy() {
    sealer.unseal(this.blip).destroy();
};

Blip.prototype.pause = function pause() {
    // There is no need to do anything here.
};

Blip.prototype.resume = function resume() {
    sealer.unseal(this.blip).resume();
};

Blip.prototype.setEncoding = function setEncoding() {
    throw new Error("setEncoding() not supported");
};

Object.defineProperty(
    Blip.prototype,
    "readable",
    {
        get: function() { return sealer.unseal(this.blip).isReadable(); },
        enumerable: true
    });

Object.freeze(Blip.prototype);

module.exports = {
    Blip: Blip
};
