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
var util = require("util");

var consts = require("./consts");
var Codec = require("./codec").Codec;
var errors = require("./errors");
var opts = require("./opts");
var sealer = require("./sealer");
var streamsanity = require("./streamsanity");


/*
 * Module variables
 */

/** Options spec */
var OPTIONS = {
  encoding: {},
  incomingEncoding: {},
  paused: {}
};


/*
 * Helper functions
 */

/**
 * Construct a Sink state object.
 */
function State(emitter, source) {
  streamsanity.validateSource(source);

  /** "parent" emitter */
  this.emitter = emitter;

  /** upstream source (must be stream-like, if not actually a Stream) */
  this.source = source;

  /** event emission encoding handler */
  this.decoder = new Codec();

  /** event receipt encoding handler */
  this.encoder = new Codec();

  /** currently paused? */
  this.paused = false;

  /** incrementally collected buffers */
  this.buffers = [];

  /** final combined data, once available */
  this.data = undefined;

  /** error payload that terminated the stream */
  this.error = consts.NO_ERROR;

  /** instance is ready to emit? */
  this.ready = false;

  /** instance has emitted and ended? */
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

State.prototype.destroy = function destroy() {
  var source = this.source;

  if (source) {
    source.removeListener(consts.CLOSE, this.onClose);
    source.removeListener(consts.DATA, this.onData);
    source.removeListener(consts.END, this.onEnd);
    source.removeListener(consts.ERROR, this.onError);
    this.source = undefined;
  }

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

  this.data = this.decoder.decode(data);
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

  if (error === consts.NO_ERROR) {
    emitter.emit(consts.END);
  } else {
    emitter.emit(consts.ERROR, error);
  }

  emitter.emit(consts.CLOSE);

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

State.prototype.onClose = function onClose(info) {
  if (this.ended || this.ready) {
    return;
  }

  this.makeData();
  if (errors.isErrorish(info)) {
    this.error = info;
  }

  if (!this.paused) {
    this.emitAllEvents();
  }
}

State.prototype.onData = function onData(data) {
  if (this.ended || this.ready) {
    return;
  }

  this.buffers.push(this.encoder.encode(data));
}

State.prototype.onEnd = function onEnd() {
  if (this.ended || this.ready) {
    return;
  }

  this.makeData();

  if (!this.paused) {
    this.emitAllEvents();
  }
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

Object.freeze(State);
Object.freeze(State.prototype);


/*
 * Exported bindings
 */

/**
 * Construct a Sink instance, which collects data events coming from the
 * indicated source stream. Sink instances are in turn instances of
 * `stream.Stream`.
 */
function Sink(source, options) {
  options = opts.validate(options, OPTIONS);
  stream.Stream.call(this);
  this.sink = sealer.seal(new State(this, source));
  opts.handleCommon(options, this);
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
  sealer.unseal(this.sink).decoder.setEncoding(name);
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
  sealer.unseal(this.sink).encoder.setEncoding(name);
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
  var error = sealer.unseal(this.sink).error;

  return (error === consts.NO_ERROR) ? undefined : error;
}

/**
 * Gets whether or not the stream ended with an error.
 */
Sink.prototype.gotError = function gotError() {
  return sealer.unseal(this.sink).error !== consts.NO_ERROR;
}

Object.freeze(Sink);
Object.freeze(Sink.prototype);

module.exports = {
  Sink: Sink
};
