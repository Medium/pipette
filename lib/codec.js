// Copyright 2012 The Obvious Corporation.

/*
 * Utilities for handing character encodings
 */

/*
 * Modules used
 */

"use strict";

var typ = require("typ");

var consts = require("./consts");


/*
 * Module variables
 */

/**
 * Special encoding value indicating default passthrough or `utf8`
 * behavior (depending on context).
 */
var NO_ENCODING = "no-encoding";


/*
 * Helper functions
 */

/**
 * Gets the "fixed" name for the given encoding, or `undefined` if the
 * named encoding is not considered valid as an argument to
 * `Stream.setEncoding()`.
 */
function fixEncoding(encodingName) {
  switch (encodingName) {
    case consts.ASCII:
    case consts.BASE64:
    case consts.HEX:
    case consts.UCS2:
    case consts.UTF8: {
      return encodingName;
    }

    // Node 0.6 doesn't understand the name "utf16le", but it's
    // defined as an alias for "ucs2" in Node 0.8. This handles that
    // confusion.
    case consts.UTF16LE: {
      return consts.UCS2;
    }

    // Be explicit here about what `undefined` translates to. This
    // makes it so an `undefined` returned from this function has the
    // natural meaning of "bogus".
    case undefined: {
      return NO_ENCODING;
    }
  }

  return undefined;
}

/**
 * Asserts that the named encoding is considered valid as an argument
 * to `Stream.setEncoding()`, returning the fixed version if so.
 */
function fixValidEncoding(encodingName) {
  var result = fixEncoding(encodingName);

  if (!result) {
    throw new Error("Invalid encoding name: " + encodingName);
  }

  return result;
}

/**
 * Encodes the given `value` with the named `encoding`, per the usual
 * contracts (see elsewhere in this file). This assumes the encoding
 * is valid.
 */
function encodeValuePrevalidated(value, encodingName) {
  if (typ.isBuffer(value)) {
    return value;
  }

  if (!typ.isString(value)) {
    value = value.toString();
  }

  return new Buffer(
    value, (encodingName === NO_ENCODING) ? consts.UTF8 : encodingName);
}


/*
 * Exported bindings
 */

/**
 * Returns whether the given encoding name is valid.
 */
function isValidName(encodingName) {
  return fixEncoding(encodingName) !== undefined;
}

/**
 * Construct a Codec instance, which manages conversions between buffers
 * and strings, with the possibility of just passing buffers through.
 * The instance starts out as a pass-through (that is, with encoding
 * set to be `undefined`).
 */
function Codec(initialEncoding) {
  this.encodingName = undefined;
  this.setEncoding(initialEncoding);
}

/**
 * Sets the encoding to use. The valid arguments are the ones named in
 * the Node docs (v0.6.*) for `Stream.setEncoding()`, plus `undefined`
 * which indicates that no string conversion should be performed.
 */
Codec.prototype.setEncoding = function setEncoding(encodingName) {
  this.encodingName = fixValidEncoding(encodingName);
}

/**
 * Encodes the given value according to the currently-defined
 * encoding.
 *
 * If `value` is a buffer, it is returned as-is. If `value` is a
 * string, this returns a buffer consisting of the encoded string. If
 * `value` is anything else, it is first converted to a string with
 * `toString()` and then from that to a buffer.
 */
Codec.prototype.encode = function encode(value) {
  return encodeValuePrevalidated(value, this.encodingName);
}

/**
 * Decodes the given buffer according to the currently-defined
 * encoding. This returns the decoded string, or returns the buffer
 * as-is if the encoding was set to `undefined`.
 */
Codec.prototype.decode = function decode(buffer) {
  var encoding = this.encodingName;
  return (encoding === NO_ENCODING) ? buffer : buffer.toString(encoding);
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

/**
 * Encodes the given `value` with the named `encoding`, validating
 * that the encoding is proper.
 *
 * If `value` is a buffer, it is returned as-is. If `value` is a
 * string, this returns a buffer consisting of the encoded string. If
 * `value` is anything else, it is first converted to a string with
 * `toString()` and then from that to a buffer.
 */
function encodeValue(value, encoding) {
  encoding = fixValidEncoding(encoding);
  return encodeValuePrevalidated(value, encoding);
}

module.exports = {
  Codec: Codec,
  encodeValue: encodeValue,
  isValidName: isValidName
};
