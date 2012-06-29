// Copyright 2012 The Obvious Corporation.

/*
 * Modules used
 */

"use strict";

var assert = require("assert");
var events = require("events");

var Slicer = require("../").Slicer;

var CallbackCollector = require("./cbcoll").CallbackCollector;
var emit = require("./emit").emit;


/*
 * Tests
 */

/**
 * Make sure the constructor doesn't fail off the bat.
 */
function constructor() {
  new Slicer(new events.EventEmitter());
  new Slicer(new events.EventEmitter(), "hex");
}

/**
 * Test expected constructor failures.
 */
function constructorFailures() {
  function f1() {
    new Slicer();
  }
  assert.throws(f1, /Missing source/);

  function f2() {
    new Slicer("non-emitter");
  }
  assert.throws(f2, /Source not an EventEmitter/);

  function f3() {
    new Slicer(new events.EventEmitter(), "bad-encoding");
  }
  assert.throws(f3, /Invalid encoding name/);
}

/**
 * Test the transition from readable to un-readable.
 */
function readableTransition() {
  var theData = new Buffer("Scones are delicious.");

  tryWith(false, "end");
  tryWith(false, "close");
  tryWith(false, "close", new Error("oy"));
  tryWith(false, "error", new Error("oof"));
  tryWith(true, "end");
  tryWith(true, "close");
  tryWith(true, "close", new Error("oy"));
  tryWith(true, "error", new Error("oof"));

  function tryWith(doData, endEvent, endArg) {
    var source = new events.EventEmitter();
    var slicer = new Slicer(source);
    var coll = new CallbackCollector();

    assert.ok(slicer.readable);

    if (doData) {
      source.emit("data", theData);
      assert.ok(slicer.readable);
    }

    if (endEvent) {
      emit(source, endEvent, endArg);
    }

    if (doData) {
      assert.ok(slicer.readable);
      slicer.readAll(coll.callback);
      assert.equal(coll.callbacks.length, 1);
      coll.assertCallback(0, undefined, theData.length, theData, 0);
    }

    assert.ok(!slicer.readable);
  }
}


function test() {
  constructor();
  constructorFailures();
  readableTransition();
}

module.exports = {
  test: test
};
