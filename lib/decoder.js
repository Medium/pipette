// Copyright 2012 The Obvious Corporation.

/*
 * Utilities for handing character encodings
 */

/*
 * Modules used
 */

"use strict";

var consts = require("./consts");


/*
 * Helper functions
 */

/**
 * Gets whether the named encoding is considered valid as an argument
 * to `Stream.setEncoding()`.
 */
function isValid(encodingName) {
    switch (encodingName) {
        case undefined:
        case consts.UTF8:
        case consts.ASCII:
        case consts.BASE64: {
            return true;
        }
    }

    return false;
}


/*
 * Exported bindings
 */

/**
 * Construct a Decoder instance, which manages the conversion of buffers
 * to strings, with the possibility of just passing buffers through.
 * The instance starts out as a pass-through (that is, with encoding
 * set to be `undefined`).
 */
function Decoder() {
    this.encodingName = undefined;
}

/**
 * Sets the encoding to use. The valid arguments are the ones named in
 * the Node docs (v0.6.*) for `Stream.setEncoding()`, plus `undefined`
 * which indicates that no string conversion should be performed.
 */
Decoder.prototype.setEncoding = function setEncoding(encodingName) {
    if (!isValid(encodingName)) {
        throw new Error("Invalid encoding name: " + encodingName);
    }

    this.encodingName = encodingName;
}

/**
 * Converts the given buffer according to the currently-defined
 * encoding.
 */
Decoder.prototype.convert = function convert(buffer) {
    var encoding = this.encodingName;
    return encoding ? buffer.toString(encoding) : buffer;
}

/**
 * Emits the given buffer as a `data` event from the given emitter, first
 * converting it according to the currently-defined encoding.
 */
Decoder.prototype.emitData = function emitData(emitter, buffer) {
    emitter.emit(consts.DATA, this.convert(buffer));
}

Object.freeze(Decoder.prototype);

module.exports = {
    Decoder: Decoder
};
