// Copyright 2012 The Obvious Corporation.

/*
 * A write multiplexer.
 */


/*
 * Modules used
 */

"use strict";

var events = require("events");
var typ = require("typ");
var util = require("util");

var Codec = require("./codec").Codec;
var consts = require("./consts");
var opts = require("./opts");
var sealer = require("./sealer");
var streamsanity = require("./streamsanity");


/*
 * Module variables
 */

/** Options spec */
var OPTIONS = {
  // This space intentionally left blank.
};


/*
 * Helper functions
 */

/**
 * Construct a Tee state object.
 */
function State(emitter, streams) {
  /** Outer event emitter. */
  this.emitter = emitter;

  /** List of streams to write to. */
  this.streams = [];

  /** Currently writable? */
  this.writable = true;

  // We `bind()` the event listener callback methods, so that they
  // get an appropriate `this` when they're called during event
  // emission.
  this.onClose = this.onClose.bind(this);
  this.onDrain = this.onDrain.bind(this);
  this.onError = this.onError.bind(this);
  this.onPipe = this.onPipe.bind(this);

  if (!Array.isArray(streams)) {
    throw new Error("Invalid streams array.");
  }

  for (var i = 0; i < streams.length; i++) {
    var one = streams[i];

    try {
      streamsanity.validateWriter(one);
    } catch (ex) {
      // Clarify with the index.
      var message = ex.message.replace(/\.$/, ": index " + i);
      throw new Error(message);
    }

    one.on(consts.CLOSE, this.onClose);
    one.on(consts.DRAIN, this.onDrain);
    one.on(consts.ERROR, this.onError);
    one.on(consts.PIPE, this.onPipe);

    this.streams.push(one);
  }
}

/**
 * Detach all the streams, and make this instance well and
 * truly closed.
 */
State.prototype.destroy = function destroy() {
  var streams = this.streams;

  if (streams) {
    for (var i = 0; i < streams.length; i++) {
      streams[i].removeListener(consts.CLOSE, this.onClose);
      streams[i].removeListener(consts.DRAIN, this.onDrain);
      streams[i].removeListener(consts.ERROR, this.onError);
      streams[i].removeListener(consts.PIPE, this.onPipe);
    }
  }

  this.emitter = undefined;
  this.streams = undefined;
  this.writable = false;
};

State.prototype.isWritable = function isWritable() {
  return this.writable;
}

/**
 * Any `close` event causes the whole instance to shut down.
 */
State.prototype.onClose = function onClose() {
  var emitter = this.emitter;

  if (emitter) {
    this.destroy();
    emitter.emit(consts.CLOSE);
  }
};

/**
 * Any `error` event causes the whole instance to shut down.
 */
State.prototype.onError = function onError(error) {
  var emitter = this.emitter;

  if (emitter) {
    this.destroy();
    emitter.emit(consts.ERROR, error);
    }
};

/**
 * All `drain` events are passed through.
 */
State.prototype.onDrain = function onDrain() {
  var emitter = this.emitter;

  if (emitter) {
    emitter.emit(consts.DRAIN);
  }
};

/**
 * All `pipe` events are passed through.
 */
State.prototype.onPipe = function onPipe(source) {
  var emitter = this.emitter;

  if (emitter) {
    emitter.emit(consts.PIPE, source);
  }
};

Object.freeze(State);
Object.freeze(State.prototype);


/*
 * Exported bindings
 */

/**
 * Construct a Tee instance, which resends writes to the given
 * list of other `streams` (an array).
 */
function Tee(streams, options) {
  options = opts.validate(options, OPTIONS);
  events.EventEmitter.call(this);
  this.tee = sealer.seal(new State(this, streams));
}

util.inherits(Tee, events.EventEmitter);

Tee.prototype.destroy = function destroy() {
  sealer.unseal(this.tee).destroy();
};

Tee.prototype.destroySoon = Tee.prototype.destroy;

Tee.prototype.write = function write(value, encoding, fd) {
  if (!this.writable) {
    throw new Error("Closed");
  }

  value = codec.encodeValue(value, encoding);

  var streams = sealer.unseal(this.tee).streams;
  var allClear = true;

  for (var i = 0; i < streams.length; i++) {
    if (!streams[i].write(value, undefined, fd)) {
      allClear = false;
    }
  }

  return allClear;
};

Tee.prototype.end = function end(value, encoding) {
  if (typ.isDefined(value)) {
    this.write(value, encoding);
  }

  var streams = sealer.unseal(this.tee).streams;

  for (var i = 0; i < streams.length; i++) {
    streams[i].end();
  }
};

Object.defineProperty(
  Tee.prototype,
  "writable",
  {
    get: function() { return sealer.unseal(this.tee).isWritable(); },
    enumerable: true
  });

Object.freeze(Tee);
Object.freeze(Tee.prototype);

module.exports = {
  Tee: Tee
};
