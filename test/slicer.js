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
 * Test the transition from readable to un-readable. This also checks
 * to make sure the upstream source is un-listened immediately upon
 * receipt of an end-type event.
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

    emit(source, endEvent, endArg);
    assert.equal(source.listeners("close").length, 0);
    assert.equal(source.listeners("data").length, 0);
    assert.equal(source.listeners("end").length, 0);
    assert.equal(source.listeners("error").length, 0);

    if (doData) {
      assert.ok(slicer.readable);
      slicer.readAll(coll.callback);
      assert.equal(coll.callbacks.length, 1);
      coll.assertCallback(0, undefined, theData.length, theData, 0);
    }

    assert.ok(!slicer.readable);
  }
}

/**
 * Tests that `destroy()` properly forces pending reads to get called
 * back and un-listens to the upstream source.
 */
function destroy() {
  var theData = new Buffer("muffins");

  for (var i = 1; i <= 10; i++) {
    tryWith(i);
  }

  function tryWith(count) {
    var source = new events.EventEmitter();
    var slicer = new Slicer(source);
    var coll = new CallbackCollector();

    for (var i = 0; i < count; i++) {
      slicer.read(10, coll.callback);
    }

    assert.equal(coll.callbacks.length, 0);
    source.emit("data", theData);
    assert.equal(coll.callbacks.length, 0);

    slicer.destroy();
    assert.ok(!slicer.readable);
    assert.equal(source.listeners("close").length, 0);
    assert.equal(source.listeners("data").length, 0);
    assert.equal(source.listeners("end").length, 0);
    assert.equal(source.listeners("error").length, 0);

    coll.assertCallback(0, undefined, theData.length, theData, 0);
    for (var i = 1; i < count; i++) {
      coll.assertCallback(i, undefined, 0, new Buffer(0), 0);
    }
  }
}

/**
 * Test that `getError()` and `gotError()` work as expected.
 */
function getErrorGotError() {
  tryWith(false, false, "end");
  tryWith(false, false, "close");
  tryWith(false, false, "close", false);
  tryWith(false, true, "end");
  tryWith(false, true, "close");
  tryWith(false, true, "close", false);

  tryWith(true, false, "error");
  tryWith(true, false, "error", false);
  tryWith(true, false, "error", new Error("yikes"));
  tryWith(true, false, "close", true);
  tryWith(true, false, "close", new Error("stuff"));

  tryWith(true, true, "error");
  tryWith(true, true, "error", new Error("spaztastic"));
  tryWith(true, true, "close", true);

  function tryWith(expectError, doData, endEvent, endArg) {
    var source = new events.EventEmitter();
    var slicer = new Slicer(source);

    assert.ok(!slicer.gotError());
    assert.equal(slicer.getError(), undefined);

    if (doData) {
      source.emit("data", "I'm a sucker for a good biscuit.");
      assert.ok(!slicer.gotError());
      assert.equal(slicer.getError(), undefined);
    }

    emit(source, endEvent, endArg);

    if (expectError) {
      assert.ok(slicer.gotError());
      assert.equal(slicer.getError(), endArg);
    } else {
      assert.ok(!slicer.gotError());
      assert.equal(slicer.getError(), undefined);
    }
  }
}

/**
 * Tests the no-data case of `readAll()`.
 */
function readAllNoData() {
  var theData = new Buffer("scone");

  tryWith(false, 1);
  tryWith(false, 2);
  tryWith(false, 10);
  tryWith(true, 1);
  tryWith(true, 2);
  tryWith(true, 10);

  function tryWith(doData, count) {
    var source = new events.EventEmitter();
    var slicer = new Slicer(source);
    var coll = new CallbackCollector();

    if (doData) {
      slicer.read(theData.length, coll.callback);
      assert.equal(coll.callbacks.length, 0);
    }

    for (var i = 0; i < count; i++) {
      slicer.readAll(coll.callback);
    }

    if (doData) {
      assert.equal(coll.callbacks.length, 0);
      source.emit("data", theData);
      coll.assertCallback(0, undefined, theData.length, theData, 0);
      coll.callbacks.shift();
    }

    assert.equal(coll.callbacks.length, count);

    for (var i = 0; i < count; i++) {
      coll.assertCallback(i, undefined, 0, new Buffer(0), 0);
    }
  }
}

/**
 * Tests the immediately-available data case of `readAll()`.
 */
function readAllImmediateData() {
  var theData = new Buffer("Who wants a cupcake?");

  var source = new events.EventEmitter();
  var slicer = new Slicer(source);
  var coll = new CallbackCollector();

  source.emit("data", theData);
  slicer.readAll(coll.callback);
  slicer.readAll(coll.callback);

  assert.equal(coll.callbacks.length, 2);
  coll.assertCallback(0, undefined, theData.length, theData, 0);
  coll.assertCallback(1, undefined, 0, new Buffer(0), 0);
}


function test() {
  constructor();
  constructorFailures();
  readableTransition();
  destroy();
  getErrorGotError();
  readAllNoData();
  readAllImmediateData();
}

module.exports = {
  test: test
};
