// Copyright 2012 The Obvious Corporation.

/*
 * Modules used
 */

"use strict";

var assert = require("assert");
var events = require("events");

var pipette = require("../");
var Cat = pipette.Cat;

var EventCollector = require("./eventcoll").EventCollector;


/*
 * Helper functions
 */

/**
 * Construct an event emitter that emits a single `error` event when resumed.
 */
function makeErrorBlip(error) {
  var emitter = new events.EventEmitter();

  var valve = new pipette.Valve(emitter);
  emitter.emit("error", error);
  emitter.emit("close");

  return valve;
}


/*
 * Tests
 */

/**
 * Make sure the constructor doesn't fail off the bat.
 */
function constructor() {
  new Cat([]);
  new Cat([new events.EventEmitter()]);

  new Cat([], false);
  new Cat([], true);

  new Cat([new events.EventEmitter()], false);
  new Cat([new events.EventEmitter()], true);
}

/**
 * Test expected constructor failures.
 */
function needStreams() {
  var good = new pipette.Blip("good");

  function f1() {
    new Cat();
  }
  assert.throws(f1, /Invalid streams array/);

  function f2() {
    new Cat(["bogus"]);
  }
  assert.throws(f2, /Source not an EventEmitter: index 0/);

  function f3() {
    new Cat([good, new Buffer(1)]);
  }
  assert.throws(f3, /Source not an EventEmitter: index 1/);

  function f4() {
    new Cat([good, good, undefined]);
  }
  assert.throws(f4, /Missing source: index 2/);

  function f5() {
    new Cat([good, good, good, null]);
  }
  assert.throws(f5, /Missing source: index 3/);

  // This is an already-ended Stream-per-se.
  var bad1 = new pipette.Blip(); 
  bad1.resume();

  function f6() {
    new Cat([good, good, bad1]);
  }
  assert.throws(f6, /Source already ended: index 2/);

  // This is an "apparently ended" readable-stream-like EventEmitter.
  var bad2 = new events.EventEmitter();
  bad2.readable = false;

  function f7() {
    new Cat([good, bad2]);
  }
  assert.throws(f7, /Source already ended: index 1/);
}

/**
 * Test a few cases where no data events should be emitted.
 */
function noDataEvents() {
  for (var i = 0; i < 10; i++) {
    tryWith(i);
  }

  function tryWith(count) {
    var blips = [];
    for (var i = 0; i < count; i++) {
      var blip = new pipette.Blip();
      blips.push(blip);
    }

    var cat = new Cat(blips);
    var coll = new EventCollector();

    for (var i = 0; i < count; i++) {
      blips[i].resume();
    }

    coll.listenAllCommon(cat);
    cat.resume();

    assert.equal(coll.events.length, 2);
    coll.assertEvent(0, cat, "end");
    coll.assertEvent(1, cat, "close");
  }
}

/**
 * Test the basic event sequence / sequencing.
 */
function basicEventSequence() {
  for (var i = 1; i < 10; i++) {
    tryWith(i);
  }

  function tryWith(count) {
    var blips = [];
    for (var i = 0; i < count; i++) {
      blips.push(new pipette.Blip("" + i));
    }

    var cat = new Cat(blips);
    var coll = new EventCollector();

    for (var i = 0; i < count; i++) {
      blips[i].resume();
    }

    coll.listenAllCommon(cat);
    cat.resume();

    assert.equal(coll.events.length, count + 2);

    for (var i = 0; i < count; i++) {
      coll.assertEvent(i, cat, "data", ["" + i]);
    }

    coll.assertEvent(count, cat, "end");
    coll.assertEvent(count + 1, cat, "close");
  }
}

/**
 * Test the basic event sequence / sequencing, where an error ends the
 * event stream.
 */
function basicErrorEventSequence() {
  for (var i = 0; i < 10; i++) {
    tryWith(i);
  }

  function tryWith(errorAt) {
    var blips = [];
    var theError = new Error("oy");

    for (var i = 0; i < 10; i++) {
      if (i == errorAt) {
        blips.push(makeErrorBlip(theError));
      } else {
        blips.push(new pipette.Blip("" + i));
      }
    }

    var cat = new Cat(blips);
    var coll = new EventCollector();

    for (var i = 0; i < blips.length; i++) {
      blips[i].resume();
    }

    coll.listenAllCommon(cat);
    cat.resume();

    assert.equal(coll.events.length, errorAt + 2);

    for (var i = 0; i < errorAt; i++) {
      coll.assertEvent(i, cat, "data", ["" + i]);
    }

    coll.assertEvent(errorAt, cat, "error", [theError]);
    coll.assertEvent(errorAt + 1, cat, "close");
  }
}

/**
 * Test that `readable` is true before events were emitted and false
 * afterwards. Also, check that it becomes false after an error.
 */
function readableTransition() {
  var cat = new Cat([]);

  assert.ok(cat.readable);
  cat.resume();
  assert.ok(!cat.readable);

  var blip = makeErrorBlip(new Error("eek"));
  var coll = new EventCollector();
  cat = new Cat([blip]);
  coll.listenAllCommon(cat);
  blip.resume();

  assert.ok(cat.readable);
  cat.resume();
  assert.ok(!cat.readable);
}

/**
 * Just demonstrate that we don't expect `setEncoding()` to operate.
 */
function setEncoding() {
  var cat = new Cat([]);

  function f() {
    cat.setEncoding("ascii");
  }

  assert.throws(f, /setEncoding\(\) not supported/);
}

/**
 * Ensure that no events get passed after a `destroy()` call.
 */
function afterDestroy() {
  var cat = new Cat([]);
  var coll = new EventCollector();

  coll.listenAllCommon(cat);
  cat.destroy();

  assert.equal(coll.events.length, 0);
  cat.resume();
  assert.equal(coll.events.length, 0);
}

function test() {
  constructor();
  needStreams();
  noDataEvents();
  basicEventSequence();
  basicErrorEventSequence();
  readableTransition();
  setEncoding();
  afterDestroy();
}

module.exports = {
  test: test
};
