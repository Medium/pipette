// Copyright 2012 The Obvious Corporation.

/*
 * A concatenation of readable streams.
 */


/*
 * Modules used
 */

"use strict";

var stream = require("stream");
var typ = require("typ");
var util = require("util");

var consts = require("./consts");
var sealer = require("./sealer");
var sourcesanity = require("./sourcesanity");

var Blip = require("./blip").Blip;
var Valve = require("./valve").Valve;


/*
 * Helper functions
 */

/**
 * Construct a Cat state object.
 */
function State(emitter, streams, paused) {
  this.emitter = emitter;
  this.streams = [];
  this.paused = typ.isDefined(paused) ? !!paused : true;
  this.readable = true;

  // We `bind()` the event listener callback methods, so that they
  // get an appropriate `this` when they're called during event
  // emission.
  this.onCloseOrEnd = this.onCloseOrEnd.bind(this);
  this.onData = this.onData.bind(this);
  this.onError = this.onError.bind(this);

  if (!Array.isArray(streams)) {
    throw new Error("Invalid streams array.");
  }

  for (var i = 0; i < streams.length; i++) {
    var one = streams[i];

    try {
      sourcesanity.validate(one);
    } catch (ex) {
      // Clarify with the index.
      var message = ex.message.replace(/\.$/, ": index " + i);
      throw new Error(message);
    }

    // Always make a valve around the given streams, so that we
    // (a) get consistent event sequencing, and (b) can
    // independently pause them without affecting other potential
    // users of the stream. With regard to (b), that is to say
    // it's a bad idea to try to be clever and do an `instanceof
    // Valve` check, since that might mess up the client; they might
    // be using a Valve for independent reasons.
    one = new Valve(one, true);
    one.on(consts.CLOSE, this.onCloseOrEnd);
    one.on(consts.DATA, this.onData);
    one.on(consts.END, this.onCloseOrEnd);
    one.on(consts.ERROR, this.onError);
    this.streams.push(one);
  }

  if (streams.length === 0) {
    // To keep the logic simpler for what's otherwise a pernicious
    // edge case, force there to always be at least one stream. In
    // particular, when the stream array is otherwise empty, add
    // an empty blip.
    var blip = new Blip();
    blip.on(consts.END, this.onCloseOrEnd);
    this.streams.push(blip);
  }

  if (!this.paused) {
    this.streams[0].resume();
  }
}

/**
 * Detach any streams that are left, and make this instance well and
 * truly closed.
 */
State.prototype.destroy = function destroy() {
  var streams = this.streams;

  if (streams) {
    for (var i = 0; i < streams.length; i++) {
      streams[i].destroy();
    }
  }

  this.emitter = undefined;
  this.streams = undefined;
  this.paused = false;
  this.readable = false;
};

State.prototype.isReadable = function isReadable() {
  return this.readable;
}

State.prototype.pause = function pause() {
  if (this.paused || !this.readable) {
    return;
  }

  this.paused = true;
  this.streams[0].pause();
};

State.prototype.resume = function resume() {
  if (!(this.paused && this.readable)) {
    return;
  }

  this.paused = false;
  this.streams[0].resume();
};

/**
 * Any `close` or `end` event is taken to mean that we should move
 * on to the next stream. Technically, streams are supposed to always
 * emit an `end` with `close` being optional, so what we do here is
 * perhaps on the paranoide side.
 */
State.prototype.onCloseOrEnd = function onCloseEnd() {
  if (!this.readable) {
    // We probably got here because of a `close` event
    // that arrived after an `error`. Nothing to do but ignore it.
    return;
  }

  var streams = this.streams;

  streams[0].destroy();
  streams.shift();

  if (streams.length === 0) {
    // We just finished the last stream: Emit `end` and `close`.
    this.emitter.emit(consts.END);
    this.emitter.emit(consts.CLOSE);
    this.readable = false;
  } else {
    streams[0].resume();
  }
}

State.prototype.onData = function onData(data) {
  this.emitter.emit(consts.DATA, data);
}

/**
 * An error in a sub-stream causes this instance to emit `error` and
 * `close` events (in that order), and then stop.
 */
State.prototype.onError = function onError(error) {
  this.emitter.emit(consts.ERROR, error);
  this.emitter.emit(consts.CLOSE);

  // Clean up and mark ourselves as closed / un-readable.
  this.destroy();
}

Object.freeze(State);
Object.freeze(State.prototype);


/*
 * Exported bindings
 */

/**
 * Construct a Cat instance, which emits the `data` events it receives
 * from any number of other `streams` (an array).
 *
 * The optional `paused` argument indicates whether the Cat starts
 * out paused (that is, buffering events). It defaults to `true`
 * (because that's the expected primary use case).
 */
function Cat(streams, paused) {
  stream.Stream.call(this);
  this.cat = sealer.seal(new State(this, streams, paused));
}

util.inherits(Cat, stream.Stream);

Cat.prototype.destroy = function destroy() {
  sealer.unseal(this.cat).destroy();
};

Cat.prototype.pause = function pause() {
  sealer.unseal(this.cat).pause();
};

Cat.prototype.resume = function resume() {
  sealer.unseal(this.cat).resume();
};

Cat.prototype.setEncoding = function setEncoding() {
  throw new Error("setEncoding() not supported");
};

Object.defineProperty(
  Cat.prototype,
  "readable",
  {
    get: function() { return sealer.unseal(this.cat).isReadable(); },
    enumerable: true
  });

Object.freeze(Cat);
Object.freeze(Cat.prototype);

module.exports = {
  Cat: Cat
};
