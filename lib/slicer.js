// Copyright 2012 The Obvious Corporation.

/*
 * A readable stream sink which provides incremental read() functionality.
 */


/*
 * Modules used
 */

"use strict";

var assert = require("assert");

var consts = require("./consts");
var Codec = require("./codec").Codec;
var errors = require("./errors");
var sealer = require("./sealer");
var sourcesanity = require("./sourcesanity");


/*
 * Helper functions
 */

/**
 * Constructs a pending read object. Arguments are akin to
 * those from `fs.read()`, except:
 *
 * * If `buffer` is unspecified, the callback will provide a
 *   freshly-allocated buffer for the result (with `offset` being
 *   ignored).
 *
 * * If `length` is unspecified, it is taken to mean "as much as
 *   possible without blocking". In the case of a defined `buffer`,
 *   this will read up to as much will actually fit in the buffer.
 */
function PendingRead(buffer, offset, length, callback) {
  this.buffer = buffer;
  this.offset = offset;
  this.length = length;
  this.callback = callback;
}

/**
 * Tries to trigger this pending read. If `force` is `true`, this
 * indicates the triggering should be forced, even if there isn't
 * sufficient buffered data; this is used when a stream has ended,
 * to allow a single partial read at the end.
 *
 * This method returns a boolean indicating whether the trigger
 * actually fired.
 */
PendingRead.prototype.trigger = function trigger(state, force) {
  // Grab these as locals, to make them saner to reference and
  // safe to modify.
  var buffer = this.buffer;
  var offset = this.offset;
  var length = this.length;
  var buffers = state.buffers;
  var bufferedLength = state.bufferedLength;

  // High-order bit #1: If the request is for zero bytes, satisfy it
  // trivially. We do this above the error check, because it makes
  // sense to let such requests succeed, even in the face of a pending
  // error.
  if (length === 0) {
    if (!buffer) {
      buffer = new Buffer(0);
    }
    this.callback(undefined, 0, buffer);
    return true;
  }

  // High-order bit #2: If the slicer is in an error state and there's
  // nothing to read first, report the error.
  if ((bufferedLength === 0) && (state.error !== consts.NO_ERROR)) {
    this.callback(state.error, 0, buffer);
    return true;
  }

  // Figure out how much to read, at most, returning if it turns
  // out the read() can't complete.

  if (length === undefined) {
    length = bufferedLength;
  }

  if (buffer) {
    length = Math.min(length, buffer.length - this.offset);
  }

  if (length > bufferedLength) {
    if (!force) {
      // Not enough data for this read() to trigger.
      return false;
    }
    // We're being forced; just read what's available.
    length = bufferedLength;
  }

  // Copy the right amount out of the pending buffers.

  if (!buffer) {
    buffer = new Buffer(length);
    offset = 0;
  }

  var origOffset = offset; // to figure out the final read length
  var endOffset = offset + length;

  while ((offset < endOffset) && (bufferedLength > 0)) {
    var one = buffers[0];
    var oneLength = buffers[0].length;

    if (oneLength <= length) {
      // Consume the entire pending buffer, since the read() wants
      // at least that much.
      one.copy(buffer, offset);
      buffers.shift();
    } else {
      // Copy just what's needed to satisfy the read(), and slice()
      // the remainder to be ready for the next request.
      one.copy(buffer, offset, 0, length);
      buffers[0] = one.slice(length);
      oneLength = length;
    }

    offset += oneLength;
    length -= oneLength;
    bufferedLength -= oneLength;
  }

  state.bufferedLength = bufferedLength; // Write back modified value.
  this.callback(undefined, endOffset - origOffset, buffer);
  return true;
}

/**
 * Constructs a Slicer state object.
 */
function State(source, incomingEncoding) {
  sourcesanity.validate(source);

  /** upstream source (must be stream-like, if not actually a Stream) */
  this.source = source;

  /** event receipt encoding handler */
  this.encoder = new Codec(incomingEncoding);

  /** queue of pending read operations */
  this.pendingReads = [];

  /** incrementally collected buffers, yet to be read */
  this.buffers = [];

  /** number of bytes of data currently in `buffers` */
  this.bufferedLength = 0;

  /** error payload that terminated the stream */
  this.error = consts.NO_ERROR;

  /** whether the stream has ended */
  this.ended = false;

  // We `bind()` the event listener callback methods, so that they
  // get an appropriate `this` when they're called during event
  // emission.
  this.onClose = this.onClose.bind(this);
  this.onData = this.onData.bind(this);
  this.onEnd = this.onEnd.bind(this);
  this.onError = this.onError.bind(this);

  source.on(consts.CLOSE, this.onClose);
  source.on(consts.DATA, this.onData);
  source.on(consts.END, this.onEnd);
  source.on(consts.ERROR, this.onError);
}

/**
 * Forces all pending reads to trigger, and then destroys the instance
 * so no further queueing can happen.
 */
State.prototype.destroy = function destroy() {
  var source = this.source;
  var pendingReads = this.pendingReads;

  if (source) {
    source.removeListener(consts.CLOSE, this.onClose);
    source.removeListener(consts.DATA, this.onData);
    source.removeListener(consts.END, this.onEnd);
    source.removeListener(consts.ERROR, this.onError);
    this.source = undefined;
  }

  if (pendingReads) {
    for (var i = 0; i < pendingReads.length; i++) {
      pendingReads[i].trigger(this, true);
    }
    // Set `this.pendingReads` to `[]` and not `undefined`, so that
    // post-destroy `read()`s will be able to behave sensibly.
    this.pendingReads = [];
  }

  this.buffers = undefined;
  this.bufferedLength = 0;
  this.ended = true;

  // Note: Not appropriate to smash `this.error` here, since it's used
  // when handling post-destroy `read()` requests.
};

State.prototype.isReadable = function isReadable() {
  return !this.ended;
}

State.prototype.onClose = function onClose(info) {
  if (this.ended) {
    return;
  }

  if (errors.isErrorish(info)) {
    this.error = info;
  }

  this.destroy();
}

State.prototype.onData = function onData(data) {
  if (this.ended) {
    return;
  }

  var encoded = this.encoder.encode(data);
  this.buffers.push(encoded);
  this.bufferedLength += encoded.length;

  // Trigger whatever pending reads can now be triggered.
  var pendingReads = this.pendingReads;
  while ((pendingReads.length > 0) &&
         pendingReads[0].trigger(this)) {
    pendingReads.shift();
  }
}

State.prototype.onEnd = function onEnd() {
  if (this.ended) {
    return;
  }

  this.destroy();
}

State.prototype.onError = function onError(error) {
  if (this.ended) {
    return;
  }

  this.error = error;
  this.destroy();
}

/**
 * Queues up a pending read.
 */
State.prototype.queue = function queue(pendingRead) {
  var pendingReads = this.pendingReads; // for ease of reference

  if (pendingReads.length === 0) {
    // This one would be the first in the queue. Try to trigger it, in
    // case it's already satisfiable. If it triggers, just return
    // instead of allowing it to be added to the queue. The second
    // argument is passed as `this.ended` to force triggering when the
    // underlying stream has ended.
    if (pendingRead.trigger(this, this.ended)) {
      return;
    }
  }

  pendingReads.push(pendingRead);
}

Object.freeze(State.prototype);


/*
 * Exported bindings
 */

/**
 * Constructs a Slicer instance, which collects data events coming
 * from the indicated source stream. Slicers in turn provide a
 * `read(..., callback)` interface for consuming the so-collected
 * data.
 */
function Slicer(source, incomingEncoding) {
  this.slicer = sealer.seal(new State(source, incomingEncoding));
}

/**
 * Destroys this instance, disconnecting it from its upstream source.
 */
Slicer.prototype.destroy = function destroy() {
  sealer.unseal(this.slicer).destroy();
};

/**
 * Sets the incoming encoding. This is how to interpret strings that are
 * received as the payloads of `data` events.
 */
Slicer.prototype.setIncomingEncoding = function setIncomingEncoding(name) {
  sealer.unseal(this.slicer).encoder.setEncoding(name);
}

/**
 * Similar to streams, this is `true` as long as there is potentially
 * more data to be read.
 */
Object.defineProperty(
  Slicer.prototype,
  "readable",
  {
    get: function() { return sealer.unseal(this.slicer).isReadable(); },
    enumerable: true
  });

/**
 * Gets the error that ended the upstream data, if any.
 */
Slicer.prototype.getError = function getError() {
  var error = sealer.unseal(this.slicer).error;

  return (error === consts.NO_ERROR) ? undefined : error;
}

/**
 * Gets whether or not the stream ended with an error.
 */
Slicer.prototype.gotError = function gotError() {
  return sealer.unseal(this.slicer).error !== consts.NO_ERROR;
}

/**
 * Queues up a read operation. All arguments but the `callback` may
 * be passed as `undefined`.
 *
 * * If `buffer` is `undefined`, then the callback will get a freshly-allocated
 *   buffer.
 *
 * * If `offset` is `undefined`, it defaults to `0`.
 *
 * * If `length` is `undefined`, it means "as much as possible without
 *   blocking" up to the allowed length given the `buffer`, or with
 *   no limit at all if `buffer` is `undefined`.
 *
 * * If `length` is defined, then the callback will only fire either
 *   when the indicated number of bytes is available *or* the stream
 *   has ended and there is no more data to be read.
 */
Slicer.prototype.read = function read(buffer, offset, length, callback) {
  if (offset === undefined) {
    offset = 0;
  }

  if (buffer) {
    var bufferLength = buffer.length;
    assert.ok((offset >= 0) && (offset < bufferLength));
    if (length) {
      var endOffset = offset + length;
      assert.ok((length >= 0) && (endOffset <= bufferLength));
    }
  }

  var pendingRead = new PendingRead(buffer, offset, length, callback);
  sealer.unseal(this.slicer).queue(pendingRead);
}

Object.freeze(Slicer.prototype);

module.exports = {
  Slicer: Slicer
};