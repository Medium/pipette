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

  var valve = new pipette.Valve(emitter, { paused: true });
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

  new Cat([], {});
  new Cat([], { paused: false });
  new Cat([], { paused: true });

  new Cat([new events.EventEmitter()], { encoding: "utf8" });
  new Cat([new events.EventEmitter()], { incomingEncoding: "ucs2" });
}

/**
 * Test expected constructor failures.
 */
function constructorFailure() {
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

  function f8() {
    new Cat([], { encoding: 12 });
  }
  assert.throws(f8, /Bad value for option: encoding/);

  function f9() {
    new Cat([], { incomingEncoding: "zorch" });
  }
  assert.throws(f9, /Bad value for option: incomingEncoding/);

  function f10() {
    new Cat([], { paused: undefined });
  }
  assert.throws(f10, /Bad value for option: paused/);

  function f11() {
    new Cat([], { zorchSplat: undefined });
  }
  assert.throws(f11, /Unknown option: zorchSplat/);
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

    var cat = new Cat(blips, { paused: true });
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
      blips.push(new pipette.Blip(makeData(i)));
    }

    var cat = new Cat(blips, { paused: true });
    var coll = new EventCollector();

    for (var i = 0; i < count; i++) {
      blips[i].resume();
    }

    coll.listenAllCommon(cat);
    cat.resume();

    assert.equal(coll.events.length, count + 2);

    for (var i = 0; i < count; i++) {
      coll.assertEvent(i, cat, "data", [makeData(i)]);
    }

    coll.assertEvent(count, cat, "end");
    coll.assertEvent(count + 1, cat, "close");
  }

  function makeData(num) {
    return new Buffer("" + num);
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
        blips.push(new pipette.Blip(makeData(i)));
      }
    }

    var cat = new Cat(blips, { paused: true });
    var coll = new EventCollector();

    for (var i = 0; i < blips.length; i++) {
      blips[i].resume();
    }

    coll.listenAllCommon(cat);
    cat.resume();

    assert.equal(coll.events.length, errorAt + 2);

    for (var i = 0; i < errorAt; i++) {
      coll.assertEvent(i, cat, "data", [makeData(i)]);
    }

    coll.assertEvent(errorAt, cat, "error", [theError]);
    coll.assertEvent(errorAt + 1, cat, "close");
  }

  function makeData(num) {
    return new Buffer("" + num);
  }
}

/**
 * Test that `readable` is true before events were emitted and false
 * afterwards. Also, check that it becomes false after an error.
 */
function readableTransition() {
  var cat = new Cat([], { paused: true });

  assert.ok(cat.readable);
  cat.resume();
  assert.ok(!cat.readable);

  var blip = makeErrorBlip(new Error("eek"));
  var coll = new EventCollector();
  cat = new Cat([blip], { paused: true });
  coll.listenAllCommon(cat);
  blip.resume();

  assert.ok(cat.readable);
  cat.resume();
  assert.ok(!cat.readable);
}

/**
 * Tests that `setEncoding()` operates as expected in terms of baseline
 * functionality.
 */
function setEncoding() {
  var source = new events.EventEmitter();
  var cat = new Cat([source]);
  var coll = new EventCollector();

  coll.listenAllCommon(cat);

  tryWith(undefined);
  tryWith("ascii");
  tryWith("base64");
  tryWith("hex");
  tryWith("utf8");

  function tryWith(name) {
    var origData = new Buffer("muffintastic");
    var expectPayload;

    if (name) {
      expectPayload = origData.toString(name);
    } else {
      expectPayload = origData;
    }

    cat.setEncoding(name);
    source.emit("data", origData);
    assert.equal(coll.events.length, 1);
    coll.assertEvent(0, cat, "data", [expectPayload]);
    coll.reset();
  }
}

/**
 * Tests that the outgoing encoding (set by `setEncoding()`) takes effect
 * at the time of emission, not at the time of upstream event receipt.
 */
function setEncodingTiming() {
  var theData = new Buffer("scones");
  var source1 = new events.EventEmitter();
  var source2 = new events.EventEmitter();
  var cat = new Cat([source1, source2]);
  var coll = new EventCollector();

  coll.listenAllCommon(cat);
  cat.pause();
  source1.emit("data", theData);
  source2.emit("data", theData);
  source1.emit("end");
  cat.setEncoding("hex");
  cat.resume();
 
  assert.equal(coll.events.length, 2);
  coll.assertEvent(0, cat, "data", [theData.toString("hex")]);
  coll.assertEvent(1, cat, "data", [theData.toString("hex")]);
}

/**
 * Tests that `setIncomingEncoding()` operates as expected in terms of
 * baseline functionality.
 */
function setIncomingEncoding() {
  var source = new events.EventEmitter();
  var cat = new Cat([source]);
  var coll = new EventCollector();

  coll.listenAllCommon(cat);

  tryWith(undefined);
  tryWith("ascii");
  tryWith("base64");
  tryWith("hex");
  tryWith("utf8");

  function tryWith(name) {
    var origData = new Buffer("biscuitastic");
    var emitData;

    if (name) {
      emitData = origData.toString(name);
    } else {
      emitData = origData;
    }

    cat.setIncomingEncoding(name);
    source.emit("data", emitData);
    assert.equal(coll.events.length, 1);
    coll.assertEvent(0, cat, "data", [origData]);
    coll.reset();
  }
}

/**
 * Tests that the incoming encoding takes effect at the time of
 * upstream event receipt, not at the time of downstream emission.
 */
function setIncomingEncodingTiming() {
  var theData = new Buffer("croissants");
  var source1 = new events.EventEmitter();
  var source2 = new events.EventEmitter();
  var cat = new Cat([source1, source2]);
  var coll = new EventCollector();

  coll.listenAllCommon(cat);
  cat.pause();
  cat.setIncomingEncoding("base64");
  source2.emit("data", theData.toString("base64"));
  cat.setIncomingEncoding("hex");
  source1.emit("data", theData.toString("hex"));
  source1.emit("end");
  cat.setIncomingEncoding("utf8");
  cat.resume();
 
  assert.equal(coll.events.length, 2);
  coll.assertEvent(0, cat, "data", [theData]);
  coll.assertEvent(1, cat, "data", [theData]);
}

/**
 * Tests the common constructor options.
 */
function commonOptions() {
  var theData = new Buffer("muffinberry biscuit");
  var source = new events.EventEmitter();
  var cat = new Cat([ source ],
                    { encoding: "base64", 
                      incomingEncoding: "hex",
                      paused: true });
  var coll = new EventCollector();

  coll.listenAllCommon(cat);
  
  source.emit("data", theData.toString("hex"));
  source.emit("end");
  source.emit("close");
  assert.ok(cat.readable);
  assert.equal(coll.events.length, 0);

  cat.resume();
  assert.ok(!cat.readable);
  assert.equal(coll.events.length, 3);
  coll.assertEvent(0, cat, "data", [theData.toString("base64")]);
  coll.assertEvent(1, cat, "end");
  coll.assertEvent(2, cat, "close");
}

/**
 * Ensure that no events get passed after a `destroy()` call.
 */
function afterDestroy() {
  var cat = new Cat([], { paused: true });
  var coll = new EventCollector();

  coll.listenAllCommon(cat);
  cat.destroy();

  assert.equal(coll.events.length, 0);
  cat.resume();
  assert.equal(coll.events.length, 0);
}

function test() {
  constructor();
  constructorFailure();
  noDataEvents();
  basicEventSequence();
  basicErrorEventSequence();
  readableTransition();
  setEncoding();
  setEncodingTiming();
  setIncomingEncoding();
  setIncomingEncodingTiming();
  commonOptions();
  afterDestroy();
}

module.exports = {
  test: test
};
