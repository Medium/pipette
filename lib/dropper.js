// Copyright 2012 The Obvious Corporation.

/*
 * A stream filter which re-emits data it receives in fixed-size chunks.
 */


/*
 * Modules used
 */

"use strict";

var stream = require("stream");
var typ = require("typ");
var util = require("util");

var Codec = require("./codec").Codec;
var consts = require("./consts");
var opts = require("./opts")
var sealer = require("./sealer");
var Valve = require("./valve").Valve;


/*
 * Module variables
 */

/** Options spec */
var OPTIONS = {
  // standard
  encoding: {},
  incomingEncoding: {},
  paused: {},

  // extra
  allowMultiple: {},
  ifPartial: {},
  size: {}
};


/*
 * Helper functions
 */

/**
 * Construct a Dropper state object.
 */
function State(emitter, source, options) {
  /** Outer emitter. */
  this.emitter = emitter;

  /**
   * Upstream source, wrapped in a Valve to provide saner semantics as
   * well as the actual implementation of `pause()`, `resume()` and
   * `setIncomingEncoding()`.
   */
  this.source = source = new Valve(source);

  /** Desired size of each emitted block, in bytes. */
  this.blockSize = options.size;

  /** Whether multiples of the block size are allowed. */
  this.allowMultiple = options.allowMultiple;

  /** What to do with a partial block at the end of the stream. */
  this.ifPartial = options.ifPartial;

  /** The encoding to use when emitting events. */
  this.decoder = new Codec();

  /** Current pending data (if any) */
  this.pendingData = undefined;

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
  // Destroy the source (our private Valve), but don't un-define it,
  // so that other calls (particularly `isReadable()`) can work
  // straightforwardly.
  this.source.destroy();

  this.emitter = undefined;
}

/**
 * Emits a `data` event for the given payload. This does decoding
 * if necessary.
 */
State.prototype.emitData = function emitData(data) {
  this.emitter.emit(consts.DATA, this.decoder.decode(data));
}

/**
 * Emits final `data` event (if any), then the end event sequence. Note:
 * `gotError` is needed as separate from `error` because we might have
 * received an `error` event with `undefined` payload.
 */
State.prototype.emitFinalEvents = function emitFinalEvents(gotError, error) {
  if (!this.emitter) {
    // This may be due to an extra event that squeaked by.
    return;
  }

  var data = this.pendingData;
  if (data && (data.length !== 0)) {
    switch (this.ifPartial) {
      case consts.EMIT: {
        this.emitData(data);
        break;
      }
      case consts.ERROR: {
        if (!gotError) {
          // There was no "larger" error, so just indicate the short
          // buffer as the error.
          gotError = true;
          error = new Error("Partial buffer at end.");
        }
        break;
      }
      case consts.IGNORE: {
        // Do nothing.
        break;
      }
      case consts.PAD: {
        var newData = new Buffer(this.blockSize);
        data.copy(newData);
        newData.fill(0, data.length);
        this.emitData(newData);
        break;
      }
    }
  }

  var emitter = this.emitter;

  if (gotError) {
    emitter.emit(consts.ERROR, error);
  } else {
    emitter.emit(consts.END);
  }

  emitter.emit(consts.CLOSE);
  this.destroy();
}

State.prototype.isReadable = function isReadable() {
  return this.source.readable;
}

State.prototype.onCloseOrEnd = function onCloseOrEnd() {
  this.emitFinalEvents(false);
}

State.prototype.onData = function onData(data) {
  var pendingData = this.pendingData;
  if (pendingData && (pendingData.length !== 0)) {
    if (data.length == 0) {
      // Empty incoming data. Nothing more to do.
      return;
    }

    // Append the new data to the pending data.
    var newLength = pendingData.length + data.length;
    var newData = new Buffer(newLength);
    pendingData.copy(newData);
    data.copy(newData, pendingData.length);
    data = newData;
    this.pendingData = undefined;
  }

  var length = data.length;
  var blockSize = this.blockSize;

  if (length < blockSize) {
    // Not enough data to emit anything.
    this.pendingData = data;
    return;
  }

  // Save the part of the data that won't be emitted (if any) as
  // `pendingData` ready for the next `data` event.
  var leftoverLength = length % blockSize;
  if (leftoverLength !== 0) {
    length -= leftoverLength;
    this.pendingData = data.slice(length);
    data = data.slice(0, length);
  }

  if (this.allowMultiple) {
    // Just emit a single `data` event for all the data.
    this.emitData(data);
  } else {
    // Emit as many `data` events as are needed.
    for (var i = 0; i < length; i += blockSize) {
      this.emitData(data.slice(i, i + blockSize));
    }
  }
}

State.prototype.onError = function onError(error) {
  this.emitFinalEvents(true, error);
}

Object.freeze(State);
Object.freeze(State.prototype);


/*
 * Exported bindings
 */

/**
 * Constructs a Dropper instance, which reemits data in fixed-size
 * blocks (aka drops). Dropper instances are in turn instances of
 * `stream.Stream`.
 */
function Dropper(source, options) {
  options = opts.validate(options, OPTIONS);
  stream.Stream.call(this);
  this.dropper = sealer.seal(new State(this, source, options));
  opts.handleCommon(options, this);
}

util.inherits(Dropper, stream.Stream);

Dropper.prototype.destroy = function destroy() {
  sealer.unseal(this.dropper).destroy();
};

Dropper.prototype.pause = function pause() {
  sealer.unseal(this.dropper).source.pause();
};

Dropper.prototype.resume = function resume() {
  sealer.unseal(this.dropper).source.resume();
};

Dropper.prototype.setEncoding = function setEncoding(name) {
  sealer.unseal(this.dropper).decoder.setEncoding(name);
};

Dropper.prototype.setIncomingEncoding = function setIncomingEncoding(name) {
  sealer.unseal(this.dropper).source.setIncomingEncoding(name);
};

Object.defineProperty(
  Dropper.prototype,
  "readable",
  {
    get: function() { return sealer.unseal(this.dropper).isReadable(); },
    enumerable: true
  });

Object.freeze(Dropper);
Object.freeze(Dropper.prototype);

module.exports = {
  Dropper: Dropper
};
