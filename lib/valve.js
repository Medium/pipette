// Copyright 2012 The Obvious Corporation.

/*
 * A simple stream reader valve, for reliably capturing stream events
 * across tick boundaries.
 */


/*
 * Modules used
 */

"use strict";

var assert = require("assert");
var stream = require("stream");
var typ = require("typ");
var util = require("util");

var consts = require("./consts");
var errors = require("./errors");
var sealer = require("./sealer");
var sourcesanity = require("./sourcesanity");


/*
 * Helper functions
 */

/**
 * Construct a Valve state object.
 */
function State(emitter, source, paused) {
  sourcesanity.validate(source);

  this.emitter = emitter;
  this.source  = source;
  this.paused  = typ.isDefined(paused) ? !!paused : true;
  this.buffer  = [];
  this.ended   = false;

  // We `bind()` the event listener callback methods, so that they
  // get an appropriate `this` when they're called during event
  // emission.
  this.onClose = this.onClose.bind(this);
  this.onData  = this.onData.bind(this);
  this.onEnd   = this.onEnd.bind(this);
  this.onError = this.onError.bind(this);

  source.on(consts.CLOSE, this.onClose);
  source.on(consts.DATA,  this.onData);
  source.on(consts.END,   this.onEnd);
  source.on(consts.ERROR, this.onError);
}

State.prototype.destroy = function destroy() {
  var source = this.source;

  if (source) {
    source.removeListener(consts.CLOSE, this.onClose);
    source.removeListener(consts.DATA,  this.onData);
    source.removeListener(consts.END,   this.onEnd);
    source.removeListener(consts.ERROR, this.onError);
    this.source = undefined;
  }

  this.paused  = false;
  this.buffer  = undefined;
  this.emitter = undefined;
  this.ended   = true;
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
  if (this.paused) {
    this.buffer.push({ func: this.onData, arg: data });
  } else if (!this.ended) {
    this.emitter.emit(consts.DATA, data);
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
function Valve(source, paused) {
  assert.ok(source !== undefined, "Missing source.");

  stream.Stream.call(this);
  this.valve = sealer.seal(new State(this, source, paused));
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

Valve.prototype.setEncoding = function setEncoding() {
  throw new Error("setEncoding() not supported");
};

Object.defineProperty(
  Valve.prototype,
  "readable",
  {
    get: function() { return sealer.unseal(this.valve).isReadable(); },
    enumerable: true
  });

Object.freeze(Valve.prototype);

module.exports = {
  Valve: Valve
};
