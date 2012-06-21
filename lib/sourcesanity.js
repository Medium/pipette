// Copyright 2012 The Obvious Corporation.

/*
 * Validation and sanitization of upstream sources.
 */


/*
 * Modules used
 */

"use strict";

var assert = require("assert");
var stream = require("stream");

var Blip = require("./blip").Blip;

/*
 * Module variables
 */

/** Special flag used to indicate that a source is a replacement */
var REPLACEMENT_FLAG = [ "replacement-flag" ];


/*
 * Exported bindings
 */

/**
 * Checks to see if a
 * readable-stream-like event emitter has ended, in a somewhat
 * safer / more conservative way than just looking at `source.readable`.
 *
 * In particular, this does used `source.readable` if `source` is
 * actually an instance of `stream.Stream`. However, if it is not,
 * then the `readable` property is only checked if it is actually
 * defined on the source (including on prototypes).
 */
function isEnded(source) {
    return ((source instanceof stream.Stream) || ("readable" in source)) &&
        !source.readable;
}

/**
 * Validates the given `source`, which must be a stream-like event
 * emitter.
 *
 * This checks to make sure that the source is defined and
 * has at least the trappings of being an emitter. If not,
 * this throws an error.
 *
 * In addition, if the source either derives from `stream.Stream` or
 * has an explicitly-defined `readable` property, then the truthiness
 * of `readable` is used to determine if the source is already closed.
 * (That is, if `source.readable` is falsey then the source is
 * considered closed.) And if so, this method throws an error to
 * indicate that fact.
 */
function validate(source) {
    assert.ok((source !== undefined) && (source !== null), "Missing source.");

    if (typeof source.on !== "function") {
        throw new Error("Source not an EventEmitter.");
    }

    if (isEnded(source)) {
        throw new Error("Source already ended.");
    }
}

module.exports = {
    isEnded: isEnded,
    validate: validate
};
