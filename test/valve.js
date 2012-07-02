// Copyright 2012 The Obvious Corporation.

/*
 * Modules used
 */

"use strict";

var assert = require("assert");
var events = require("events");

var Blip = require("../").Blip;
var Valve = require("../").Valve;

var EventCollector = require("./eventcoll").EventCollector;
var emit = require("./emit").emit;


/*
 * Tests
 */

/**
 * Make sure the constructor doesn't fail off the bat.
 */
function constructor() {
  new Valve(new events.EventEmitter());
  new Valve(new events.EventEmitter(), true);
  new Valve(new events.EventEmitter(), false);
}

/**
 * Test expected constructor failures.
 */
function needSource() {
  function f1() {
    new Valve();
  }
  assert.throws(f1, /Missing source/);

  function f2() {
    new Valve(["hello"]);
  }
  assert.throws(f2, /Source not an EventEmitter/);

  // This is an already-ended Stream-per-se.
  var bad = new Blip();
  bad.resume();

  function f3() {
    new Valve(bad);
  }
  assert.throws(f3, /Source already ended./);
}

/**
 * Test that no events get added spontaneously.
 */
function noInitialEvents() {
  var source = new events.EventEmitter();
  var valve = new Valve(source);
  var coll = new EventCollector();

  coll.listenAllCommon(valve);
  valve.resume();
  assert.equal(coll.events.length, 0);
}

/**
 * Test that `readable` is true until an end-type event comes through.
 */
function readableTransition() {
  tryWith("end");
  tryWith("close");
  tryWith("error", new Error("criminy"));

  function tryWith(name, arg) {
    var source = new events.EventEmitter();
    var valve = new Valve(source);
    var coll = new EventCollector();

    coll.listenAllCommon(valve);
    assert.ok(valve.readable);

    valve.resume();
    assert.ok(valve.readable);

    valve.pause();
    assert.ok(valve.readable);

    emit(source, name, arg);
    assert.ok(valve.readable);
    assert.equal(coll.events.length, 0);

    valve.resume();
    assert.equal(coll.events.length, 2);
    assert.ok(!valve.readable);
  }
}

/**
 * Test that no events will get passed through after a close sequence
 * (`end` or `error` followed by `close`).
 */
function eventsAfterClose() {
  var theError = new Error("insufficient muffins");

  tryWith(false, "data", "stuff");
  tryWith(false, "end");
  tryWith(false, "close");
  tryWith(false, "error", new Error("oy"));
  tryWith(true, "data", "stuff");
  tryWith(true, "end");
  tryWith(true, "close");
  tryWith(true, "error", new Error("oy"));

  function tryWith(doError, name, arg) {
    var source = new events.EventEmitter();
    var valve = new Valve(source, false);
    var coll = new EventCollector();

    coll.listenAllCommon(valve);

    if (doError) {
      source.emit("error", theError);
    } else {
      source.emit("end");
    }

    assert.equal(coll.events.length, 2);

    if (doError) {
      coll.assertEvent(0, valve, "error", [theError]);
    } else {
      coll.assertEvent(0, valve, "end");
    }

    coll.assertEvent(1, valve, "close");
    coll.reset();

    // In case the event to be sent is an `error`, this listener
    // suppresses the Node default "unhandled error" behavior.
    source.on("error", function () { /*ignore*/ });

    emit(source, name, arg);
    assert.equal(coll.events.length, 0);
  }
}

/**
 * Test buffering of a some data events.
 */
function bufferDataEvents() {
  for (var i = 1; i < 200; i += 11) {
    tryWith(i);
  }

  function tryWith(count) {
    var source = new events.EventEmitter();
    var valve = new Valve(source);
    var coll = new EventCollector();

    coll.listenAllCommon(valve);

    for (var i = 0; i < count; i++) {
      source.emit("data", bufFor(i));
    }

    assert.equal(coll.events.length, 0);
    valve.resume();
    assert.equal(coll.events.length, count);

    for (var i = 0; i < count; i++) {
      coll.assertEvent(i, valve, "data", [bufFor(i)]);
    }
  }

  function bufFor(val) {
    return new Buffer("" + val);
  }
}

/**
 * Test buffering of the end-type events.
 */
function bufferEnders() {
  tryWith("end");
  tryWith("close");
  tryWith("error", new Error("yipe"));

  function tryWith(name, arg) {
    var source = new events.EventEmitter();
    var valve = new Valve(source);
    var coll = new EventCollector();

    coll.listenAllCommon(valve);
    source.emit("data", "whee");
    emit(source, name, arg);
    assert.equal(coll.events.length, 0);

    valve.resume();
    assert.equal(coll.events.length, 3);

    // If we sent a `close` event, we still expect the second
    // event to be an `end`, because of how Valve consistent-ifies
    // the event sequence.
    if (name === "close") {
      name = "end";
    }

    coll.assertEvent(0, valve, "data", ["whee"]);
    coll.assertEvent(1, valve, name, arg ? [arg] : undefined);
    coll.assertEvent(2, valve, "close");
  }
}

/**
 * Test that events flow without pause when the valve is open (resumed).
 */
function eventsAfterResume() {
  var source = new events.EventEmitter();
  var valve = new Valve(source);
  var coll = new EventCollector();

  coll.listenAllCommon(valve);
  source.emit("data", "hello");
  assert.equal(coll.events.length, 0);

  valve.resume();
  assert.equal(coll.events.length, 1);
  coll.reset();

  source.emit("data", "stuff");
  assert.equal(coll.events.length, 1);
  coll.reset();

  source.emit("data", "more stuff");
  assert.equal(coll.events.length, 1);
}

/**
 * Test that a `close` event without an "errorish" payload gets properly
 * relayed as a no-payload event.
 */
function closeWithoutPayload() {
  tryWith(undefined);
  tryWith(false);

  function tryWith(payload) {
    var source = new events.EventEmitter();
    var valve = new Valve(source, false);
    var coll = new EventCollector();

    coll.listenAllCommon(valve);
    source.emit("close", payload);

    assert.equal(coll.events.length, 2);
    coll.assertEvent(0, valve, "end");
    coll.assertEvent(1, valve, "close");
  }
}

/**
 * Test that a `close` event with a payload gets properly split into
 * an `error` and then a `close` event.
 */
function closeWithPayload() {
  tryWith(true);
  tryWith(new Error("yikes"));
  tryWith("string indicating crazy condition");

  function tryWith(payload) {
    var source = new events.EventEmitter();
    var valve = new Valve(source, false);
    var coll = new EventCollector();

    coll.listenAllCommon(valve);
    source.emit("close", payload);

    assert.equal(coll.events.length, 2);
    coll.assertEvent(0, valve, "error", [payload]);
    coll.assertEvent(1, valve, "close");
  }
}

/**
 * Just demonstrate that we don't expect `setEncoding()` to operate.
 */
function setEncoding() {
  var valve = new Valve(new events.EventEmitter());

  function f() {
    valve.setEncoding("ascii");
  }

  assert.throws(f, /setEncoding\(\) not supported/);
}

/**
 * Ensure that no events get passed after a `destroy()` call. Also, proves
 * that the valve isn't even listening for events from the source anymore.
 */
function afterDestroy() {
  var source = new events.EventEmitter();
  var valve = new Valve(source, false);
  var coll = new EventCollector();

  coll.listenAllCommon(valve);
  valve.destroy();
  source.emit("data", "yes?");
  source.emit("end");
  source.emit("close");

  assert.equal(coll.events.length, 0);

  assert.equal(source.listeners("close").length, 0);
  assert.equal(source.listeners("data").length, 0);
  assert.equal(source.listeners("end").length, 0);
  assert.equal(source.listeners("error").length, 0);
}

/**
 * Ensure that things don't go haywire if a valve is destroyed in the
 * middle of being resumed.
 */
function destroyDuringResume() {
  var source = new events.EventEmitter();
  var valve = new Valve(source);
  var coll = new EventCollector();

  coll.listenAllCommon(valve);
  source.emit("data", "stuff");
  source.emit("end");

  valve.on("data", function() { valve.destroy(); });
  valve.resume();

  assert.equal(coll.events.length, 1);
  coll.assertEvent(0, valve, "data", ["stuff"]);
}


function test() {
  constructor();
  needSource();
  noInitialEvents();
  readableTransition();
  eventsAfterClose();
  bufferDataEvents();
  bufferEnders();
  eventsAfterResume();
  closeWithoutPayload();
  closeWithPayload();
  setEncoding();
  afterDestroy();
  destroyDuringResume();
}

module.exports = {
  test: test
};
