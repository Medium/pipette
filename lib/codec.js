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
    case consts.ASCII:
    case consts.BASE64:
    case consts.HEX:
    case consts.UCS2:
    case consts.UTF8:
    case consts.UTF16LE: {
      return true;
    }
  }

  return false;
}


/*
 * Exported bindings
 */

/**
 * Construct a Codec instance, which manages conversions between buffers
 * and strings, with the possibility of just passing buffers through.
 * The instance starts out as a pass-through (that is, with encoding
 * set to be `undefined`).
 */
function Codec(initialEncoding) {
  this.encodingName = undefined;

  if (initialEncoding) {
    this.setEncoding(initialEncoding);
  }
}

/**
 * Sets the encoding to use. The valid arguments are the ones named in
 * the Node docs (v0.6.*) for `Stream.setEncoding()`, plus `undefined`
 * which indicates that no string conversion should be performed.
 */
Codec.prototype.setEncoding = function setEncoding(encodingName) {
  if (!isValid(encodingName)) {
    throw new Error("Invalid encoding name: " + encodingName);
  }

  // Node 0.6 doesn't understand the name "utf16le", but it's
  // defined as an alias for "ucs2" in Node 0.8. This handles that
  // confusion.
  if (encodingName === consts.UTF16LE) {
    encodingName = consts.UCS2;
  }

  this.encodingName = encodingName;
}

/**
 * Encodes the given value according to the currently-defined
 * encoding. If `value` is a string, this returns a buffer consisting
 * of the encoded string. If `value` is a buffer, it is returned as-is.
 * If `value` is a string but the current encoding is `undefined`, this
 * treats it as if the encoding were set to `utf8`.
 */
Codec.prototype.encode = function encode(value) {
  if (Buffer.isBuffer(value)) {
    return value;
  } else {
    return new Buffer(value, this.encodingName);
  }
}

/**
 * Decodes the given buffer according to the currently-defined
 * encoding. This returns the decoded string, or returns the buffer
 * as-is if the encoding is `undefined`.
 */
Codec.prototype.decode = function decode(buffer) {
  var encoding = this.encodingName;
  return encoding ? buffer.toString(encoding) : buffer;
}

/**
 * Emits the given buffer as a `data` event from the given emitter, first
 * decoding it according to the currently-defined encoding.
 */
Codec.prototype.emitData = function emitData(emitter, buffer) {
  emitter.emit(consts.DATA, this.decode(buffer));
}

Object.freeze(Codec);
Object.freeze(Codec.prototype);

module.exports = {
  Codec: Codec
};
