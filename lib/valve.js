// Copyright 2012 The Obvious Corporation.

/*
 * A simple stream reader valve, for reliably capturing stream events
 * across tick boundaries.
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
 * Construct a Valve state object.
 */
function State(emitter, source) {
  streamsanity.validateSource(source);

  /** Outer emitter instance. */
  this.emitter = emitter;

  /** Upstream source. */
  this.source = source;

  /** Encoding to use when interpreting incoming non-buffer data events. */
  this.encoder = new Codec();

  /** Encoding to use when emitting events. */
  this.decoder = new Codec();

  /** Currently paused? */
  this.paused = false;

  /** Buffered up events, to be emitted in order once unpaused. */
  this.buffer = [];

  /** Has the instance been ended? */
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

  this.paused = false;
  this.buffer = undefined;
  this.emitter = undefined;
  this.ended = true;
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

/**
 * If not yet ended, this emits a final informational event (either an
 * `end` or an `error`) followed by a `close` event. Then, this marks
 * the instance as ended. For an `end` event, the event argument is
 * ignored. This method does nothing if the instance is already ended.
 *
 * Note: The `isError` argument is necessary, since it is valid to
 * emit an `error` event with an arbitrary payload, including
 * `undefined`.
 */
State.prototype.end = function end(isError, errorArg) {
  if (this.ended) {
    return;
  }

  // Capture the emitter in a local, becuase emitting the
  // informational event could cause this instance to be
  // synchronously destroyed. However, it's still appropriate to get
  // the `close` event out.
  var emitter = this.emitter;

  if (emitter) {
    if (isError) {
      emitter.emit(consts.ERROR, errorArg);
    } else {
      emitter.emit(consts.END);
    }
    emitter.emit(consts.CLOSE);
  }

  this.destroy();
}

State.prototype.onClose = function onClose(info) {
  if (this.paused) {
    this.buffer.push({ func: this.onClose, arg: info });
  } else {
    this.end(errors.isErrorish(info), info);
  }
}

State.prototype.onData = function onData(data) {
  // Do the encoding-to-buffer when the event is received, to capture
  // the specified incoming encoding at the time of the original
  // event.
  data = this.encoder.encode(data);

  if (this.paused) {
    this.buffer.push({ func: this.onData, arg: data });
  } else if (!this.ended) {
    // Do the decoding-to-string at the moment the event is to be
    // emitted, to capture the outgoing encoding at the time of actual
    // emission.
    this.emitter.emit(consts.DATA, this.decoder.decode(data));
  }
}

State.prototype.onEnd = function onEnd() {
  if (this.paused) {
    this.buffer.push({ func: this.onEnd });
  } else {
    this.end(false);
  }
}

State.prototype.onError = function onError(error) {
  if (this.paused) {
    this.buffer.push({ func: this.onError, arg: error });
  } else {
    this.end(true, error);
  }
}

Object.freeze(State);
Object.freeze(State.prototype);


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
function Valve(source, options) {
  options = opts.validate(options, OPTIONS);
  stream.Stream.call(this);
  this.valve = sealer.seal(new State(this, source));
  opts.handleCommon(options, this);
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

Valve.prototype.setEncoding = function setEncoding(encodingName) {
  sealer.unseal(this.valve).decoder.setEncoding(encodingName);
};

Valve.prototype.setIncomingEncoding =
function setIncomingEncoding(encodingName) {
  sealer.unseal(this.valve).encoder.setEncoding(encodingName);
};

Object.defineProperty(
  Valve.prototype,
  "readable",
  {
    get: function() { return sealer.unseal(this.valve).isReadable(); },
    enumerable: true
  });

Object.freeze(Valve);
Object.freeze(Valve.prototype);

module.exports = {
  Valve: Valve
};
