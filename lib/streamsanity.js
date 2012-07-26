// Copyright 2012 The Obvious Corporation.

/*
 * Validation and sanitization of stream(-like) objects.
 */


/*
 * Modules used
 */

"use strict";

var assert = require("assert");
var stream = require("stream");
var typ = require("typ");


/*
 * Exported bindings
 */

/**
 * Checks to see if a readable-stream-like event emitter has ended, in
 * a somewhat safer / more conservative way than just looking at
 * `source.readable`.
 *
 * In particular, this does used `source.readable` if `source` is
 * actually an instance of `stream.Stream`. However, if it is not,
 * then the `readable` property is only checked if it is actually
 * defined on the source (including on prototypes).
 */
function readerIsEnded(source) {
  return ((source instanceof stream.Stream) || ("readable" in source)) &&
    !source.readable;
}

/**
 * Checks to see if a writable-stream-like event emitter has ended.
 */
function writerIsEnded(writer) {
  return !writer.writable;
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
function validateSource(source) {
  assert.ok(!typ.isNullish(source), "Missing source.");

  if (!typ.isFunction(source.on)) {
    throw new Error("Source not an EventEmitter.");
  }

  if (readerIsEnded(source)) {
    throw new Error("Source already ended.");
  }
}

/**
 * Validates the given `writer`, which must be a writable stream,
 * per the Node spec for same.
 *
 * This checks that the writer is defined, has at least
 * the trappings of being an emitter, has `write()` and
 * `end()` methods, and has a `writable` field that is `true`.
 */
function validateWriter(writer) {
  assert.ok(!typ.isNullish(writer), "Missing writer.");

  if (!typ.isFunction(writer.on)) {
    throw new Error("Writer not an EventEmitter.");
  }

  if (writerIsEnded(writer)) {
    throw new Error("Writer already ended.");
  }
}


module.exports = {
  readerIsEnded: readerIsEnded,
  validateSource: validateSource,
  validateWriter: validateWriter,
  writerIsEnded: writerIsEnded
};
