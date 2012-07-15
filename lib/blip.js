// Copyright 2012 The Obvious Corporation.

/*
 * A readable stream that exists to emit a single data event.
 */


/*
 * Modules used
 */

"use strict";

var stream = require("stream");
var typ = require("typ");
var util = require("util");

var codec = require("./codec");
var consts = require("./consts");
var opts = require("./opts");
var sealer = require("./sealer");


/*
 * Module variables
 */

/** Options spec */
var OPTIONS = {
  encoding: {},
  incomingEncoding: {}
};


/*
 * Helper functions
 */

/**
 * Construct a Blip state object.
 */
function State(emitter, data) {
  /** Outer event emitter. */
  this.emitter = emitter;

  /** Decoder to use when emitting. */
  this.decoder = new codec.Codec();

  /** Data to emit. */
  this.data = data;

  /** Currently paused? */
  this.paused = true;

  /** Currently readable? */
  this.readable = true;
}

State.prototype.destroy = function destroy() {
  this.emitter = undefined;
  this.data = undefined;
  this.paused = false;
  this.readable = false;
};

State.prototype.isReadable = function isReadable() {
  return this.readable;
}

State.prototype.resume = function resume() {
  if (!this.paused) {
    return;
  }

  var data = this.data;
  var emitter = this.emitter;

  this.paused = false;

  if (typ.isDefined(data)) {
    emitter.emit(consts.DATA, this.decoder.decode(data));
  }

  emitter.emit(consts.END);
  emitter.emit(consts.CLOSE);
  this.data = undefined;
  this.readable = false;
};

Object.freeze(State);
Object.freeze(State.prototype);


/*
 * Exported bindings
 */

/**
 * Construct a Blip instance, which emits a single `data` event followed
 * by `end` and `close` events. Blip instances are in turn instances of
 * `stream.Stream`.
 *
 * The `data` argument must be a string or buffer to emit as data.
 *
 * Blip instances always start out paused, because there is no point
 * in having them start out running, as their events would immediately
 * get lost.
 */
function Blip(data, options) {
  if (typ.isDefined(data) && !typ.isString(data) && !typ.isBuffer(data)) {
    throw new Error("Data not a string or buffer.");
  }

  options = opts.validate(options, OPTIONS);

  if (typ.isString(data)) {
    // The `incomingEncoding` specifies an immediate transform of the
    // `data`.
    data = codec.encodeValue(data, options.incomingEncoding);
    delete options.incomingEncoding; // Prevent handleCommon() from using it.
  }

  stream.Stream.call(this);
  this.blip = sealer.seal(new State(this, data));

  opts.handleCommon(options, this);
}

util.inherits(Blip, stream.Stream);

Blip.prototype.destroy = function destroy() {
  sealer.unseal(this.blip).destroy();
};

Blip.prototype.pause = function pause() {
  // There is no need to do anything here.
};

Blip.prototype.resume = function resume() {
  sealer.unseal(this.blip).resume();
};

Blip.prototype.setEncoding = function setEncoding(name) {
  sealer.unseal(this.blip).decoder.setEncoding(name);
};

Object.defineProperty(
  Blip.prototype,
  "readable",
  {
    get: function() { return sealer.unseal(this.blip).isReadable(); },
    enumerable: true
  });

Object.freeze(Blip);
Object.freeze(Blip.prototype);

module.exports = {
  Blip: Blip
};
