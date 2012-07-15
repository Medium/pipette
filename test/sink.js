// Copyright 2012 The Obvious Corporation.

/*
 * Modules used
 */

"use strict";

var assert = require("assert");
var events = require("events");

var Blip = require("../").Blip;
var Sink = require("../").Sink;

var EventCollector = require("./eventcoll").EventCollector;
var emit = require("./emit").emit;


/*
 * Tests
 */

/**
 * Make sure the constructor doesn't fail off the bat.
 */
function constructor() {
  new Sink(new events.EventEmitter());
  new Sink(new events.EventEmitter(), {});
  new Sink(new events.EventEmitter(), { encoding: "hex" });
  new Sink(new events.EventEmitter(), { incomingEncoding: "hex" });
  new Sink(new events.EventEmitter(), { paused: true });
  new Sink(new events.EventEmitter(), { paused: false });
}

/**
 * Test expected constructor failures.
 */
function constructorFailure() {
  function f1() {
    new Sink();
  }
  assert.throws(f1, /Missing source/);

  function f2() {
    new Sink(["hello"]);
  }
  assert.throws(f2, /Source not an EventEmitter/);

  // This is an already-ended Stream-per-se.
  var bad = new Blip();
  bad.resume();

  function f3() {
    new Sink(bad);
  }
  assert.throws(f3, /Source already ended./);

  function f4() {
    new Sink(new Blip(), { encoding: 12 });
  }
  assert.throws(f4, /Bad value for option: encoding/);

  function f5() {
    new Sink(new Blip(), { incomingEncoding: "zorch" });
  }
  assert.throws(f5, /Bad value for option: incomingEncoding/);

  function f6() {
    new Sink(new Blip(), { paused: undefined });
  }
  assert.throws(f6, /Bad value for option: paused/);

  function f7() {
    new Sink(new Blip(), { zorchSplat: undefined });
  }
  assert.throws(f7, /Unknown option: zorchSplat/);
}

/**
 * Test that invalid encodings are rejected.
 */
function badEncodings() {
  var sink = new Sink(new events.EventEmitter());

  function f1() {
    sink.setEncoding("blort");
  }
  assert.throws(f1, /Invalid encoding name/);

  function f2() {
    sink.setIncomingEncoding("biff");
  }
  assert.throws(f2, /Invalid encoding name/);
}

/**
 * Test that no events get added spontaneously.
 */
function noInitialEvents() {
  var source = new events.EventEmitter();
  var sink = new Sink(source);
  var coll = new EventCollector();

  sink.pause();
  coll.listenAllCommon(sink);
  sink.resume();
  assert.equal(coll.events.length, 0);
}

/**
 * Test that `readable` is true until an end-type event comes through.
 */
function readableTransition() {
  tryWith(false, "end");
  tryWith(false, "close");
  tryWith(false, "error", new Error("criminy"));
  tryWith(true, "end");
  tryWith(true, "close");
  tryWith(true, "error", new Error("criminy"));

  function tryWith(pauseFirst, name, arg) {
    var source = new events.EventEmitter();
    var sink = new Sink(source);
    var coll = new EventCollector();

    coll.listenAllCommon(sink);
    assert.ok(sink.readable);

    if (pauseFirst) {
      sink.pause();
    }

    emit(source, name, arg);

    if (pauseFirst) {
      assert.equal(coll.events.length, 0);
      assert.ok(sink.readable);
      sink.resume();
    }

    assert.equal(coll.events.length, 2);
    assert.ok(!sink.readable);
  }
}

/**
 * Test that no further events get emitted after an end-type event.
 */
function eventsAfterEnd() {
  tryWith(false, "end");
  tryWith(false, "close");
  tryWith(false, "error", new Error("oy"));
  tryWith(true, "end");
  tryWith(true, "close");
  tryWith(true, "error", new Error("oy"));

  function tryWith(extraData, name, arg) {
    var source = new events.EventEmitter();
    var sink = new Sink(source);
    var coll = new EventCollector();

    coll.listenAllCommon(sink);
    emit(source, name, arg);
    assert.equal(coll.events.length, 2);
    coll.reset();

    if (extraData) {
      source.emit("data", "huzzah");
      assert.equal(coll.events.length, 0);
    }

    source.emit("end");
    assert.equal(coll.events.length, 0);

    source.emit("close");
    assert.equal(coll.events.length, 0);

    source.emit("error", new Error("eek"));
    assert.equal(coll.events.length, 0);
  }
}

/**
 * Test a few no-data-events cases.
 */
function noDataEvents() {
  tryWith("end", undefined);
  tryWith("close", undefined);
  tryWith("error", new Error("yow"));

  function tryWith(endEvent, endArg) {
    var isError = (endEvent === "error");
    var source = new events.EventEmitter();
    var sink = new Sink(source);
    var coll = new EventCollector();

    coll.listenAllCommon(sink);
    emit(source, endEvent, endArg);

    assert.equal(coll.events.length, 2);

    if (isError) {
      coll.assertEvent(0, sink, "error", [endArg]);
    } else {
      coll.assertEvent(0, sink, "end", undefined);
      coll.assertEvent(1, sink, "close", undefined);
    }
  }
}

/**
 * Test a few single data event cases.
 */
function singleDataEvent() {
  var theData = new Buffer("stuff");

  tryWith("end", undefined);
  tryWith("close", undefined);
  tryWith("error", new Error("yow"));

  function tryWith(endEvent, endArg) {
    var isError = (endEvent === "error");
    var source = new events.EventEmitter();
    var sink = new Sink(source);
    var coll = new EventCollector();

    coll.listenAllCommon(sink);
    source.emit("data", theData);
    emit(source, endEvent, endArg);

    assert.equal(coll.events.length, 3);
    coll.assertEvent(0, sink, "data", [theData]);

    if (isError) {
      coll.assertEvent(1, sink, "error", [endArg]);
    } else {
      coll.assertEvent(1, sink, "end", undefined);
    }

    coll.assertEvent(2, sink, "close", undefined);
  }
}

/**
 * Test the collection of multiple data events.
 */
function multipleDataEvents() {
  for (var i = 1; i < 200; i += 17) {
    tryWith(i);
  }

  function tryWith(count) {
    var source = new events.EventEmitter();
    var sink = new Sink(source);
    var coll = new EventCollector();
    var expect = "";

    coll.listenAllCommon(sink);

    for (var i = 0; i < count; i++) {
      var buf = bufFor(i);
      expect += buf.toString();
      source.emit("data", buf);
    }

    assert.equal(coll.events.length, 0);
    source.emit("end");
    assert.equal(coll.events.length, 3);

    coll.assertEvent(0, sink, "data", [new Buffer(expect)]);
    coll.assertEvent(1, sink, "end", undefined);
    coll.assertEvent(2, sink, "close", undefined);
  }

  function bufFor(val) {
    return new Buffer("#" + val);
  }
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
    var sink = new Sink(source);
    var coll = new EventCollector();

    coll.listenAllCommon(sink);
    source.emit("close", payload);

    assert.equal(coll.events.length, 2);
    coll.assertEvent(0, sink, "end");
    coll.assertEvent(1, sink, "close");
  }
}

/**
 * Test that a `close` event with a payload gets properly split into
 * an `error` and then a `close` event.
 */
function closeWithPayload() {
  tryWith(true);
  tryWith(new Error("yowza"));
  tryWith(["You never know when you might get an array."]);

  function tryWith(payload) {
    var source = new events.EventEmitter();
    var sink = new Sink(source);
    var coll = new EventCollector();

    coll.listenAllCommon(sink);
    source.emit("close", payload);

    assert.equal(coll.events.length, 2);
    coll.assertEvent(0, sink, "error", [payload]);
    coll.assertEvent(1, sink, "close");
  }
}

/**
 * Check that emit-side encoding works as expected.
 */
function setEncoding() {
  tryWith(undefined);
  tryWith("ascii");
  tryWith("base64");
  tryWith("hex");
  tryWith("ucs2");
  tryWith("utf8");
  tryWith("utf16le", "ucs2");

  function tryWith(enc, expectEnc) {
    expectEnc = expectEnc || enc; // See codec.setEncoding() implementation.

    var source = new events.EventEmitter();
    var sink = new Sink(source);
    var coll = new EventCollector();

    coll.listenAllCommon(sink);
    source.emit("data", "testing");
    source.emit("data", "123");
    sink.setEncoding(enc);
    source.emit("end");

    var expect = new Buffer("testing123");
    if (enc) {
      expect = expect.toString(expectEnc);
    }

    coll.assertEvent(0, sink, "data", [expect]);
    coll.assertEvent(1, sink, "end", undefined);
    coll.assertEvent(2, sink, "close", undefined);
  }
}

/**
 * Test that `setIncomingEncoding()` operates properly.
 */
function setIncomingEncoding() {
  var source = new events.EventEmitter();
  var sink = new Sink(source);

  // Default to utf-8.
  source.emit("data", "\u168c-gort"); // "OGHAM LETTER GORT"

  sink.setIncomingEncoding("base64");
  source.emit("data", "LWJpc2N1aXRzCg=="); // "-biscuits\n"

  sink.setIncomingEncoding("ascii");
  source.emit("data", "scones");

  sink.setIncomingEncoding("utf8");
  source.emit("data", "-\u1683-fearn"); // "OGHAM LETTER FEARN"
  source.emit("end");

  assert.equal(sink.getData().toString(),
         "\u168c-gort-biscuits\nscones-\u1683-fearn");
}

/**
 * Tests the common constructor options.
 */
function commonOptions() {
  var theData = new Buffer("muffinberry scone", "ucs2");
  var source = new events.EventEmitter();
  var sink = new Sink(source,
                      { encoding: "base64", 
                        incomingEncoding: "ucs2",
                        paused: true });
  var coll = new EventCollector();

  coll.listenAllCommon(sink);
  
  source.emit("data", theData.toString("ucs2"));
  source.emit("end");
  source.emit("close");
  assert.ok(sink.readable);
  assert.equal(coll.events.length, 0);

  sink.resume();
  assert.ok(!sink.readable);
  assert.equal(coll.events.length, 3);
  coll.assertEvent(0, sink, "data", [theData.toString("base64")]);
  coll.assertEvent(1, sink, "end");
  coll.assertEvent(2, sink, "close");

  assert.equal(sink.getData(), theData.toString("base64"));
}

/**
 * Ensure that no events get passed after a `destroy()` call. Also, proves
 * that the valve isn't even listening for events from the source anymore.
 */
function afterDestroy() {
  var source = new events.EventEmitter();
  var sink = new Sink(source);
  var coll = new EventCollector();

  coll.listenAllCommon(sink);
  sink.destroy();
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
 * Ensure that things don't go haywire if a sink is destroyed in the
 * middle of being resumed.
 */
function destroyDuringResume() {
  var source = new events.EventEmitter();
  var sink = new Sink(source);
  var coll = new EventCollector();

  sink.on("data", function() { sink.destroy(); });
  coll.listenAllCommon(sink);
  source.emit("data", "stuff");
  source.emit("end");

  assert.equal(coll.events.length, 3);
  coll.assertEvent(0, sink, "data", [new Buffer("stuff")]);
}

/**
 * Test that `getData()` returns `undefined` before there is data
 * and an appropriate value after.
 */
function appropriateGetData() {
  var theData = new Buffer("stuffy stuff");

  tryWith(false, "end", undefined);
  tryWith(false, "close", undefined);
  tryWith(false, "error", new Error("yow"));
  tryWith(true, "end", undefined);
  tryWith(true, "close", undefined);
  tryWith(true, "error", new Error("yow"));

  function tryWith(doData, endEvent, endArg) {
    var source = new events.EventEmitter();
    var sink = new Sink(source);
    var expect = doData ? theData : undefined;
    var coll = new EventCollector();

    assert.equal(sink.getData(), undefined);
    coll.listenAllCommon(sink); // just to capture the error, if any

    if (doData) {
      source.emit("data", theData);
      assert.equal(sink.getData(), undefined);
    }

    emit(source, endEvent, endArg);
    assert.equal(sink.getData(), expect);
  }
}

/**
 * Test that `getError()` returns `undefined` before there is an error
 * and an appropriate value after.
 */
function appropriateGetError() {
  var theError = new Error("Missing muffin");

  tryWith(undefined, false);
  tryWith(undefined, true);
  tryWith(theError, false);
  tryWith(theError, true);

  function tryWith(error, doData) {
    var source = new events.EventEmitter();
    var sink = new Sink(source);
    var coll = new EventCollector();

    assert.equal(sink.getError(), undefined);
    coll.listenAllCommon(sink); // just to capture the error

    if (doData) {
      source.emit("data", "howdy");
      assert.equal(sink.getError(), undefined);
    }

    source.emit("error", error);
    assert.equal(sink.getError(), error);
  }
}

/**
 * Test that `gotError()` returns `false` before there is an error
 * and `true` after.
 */
function appropriateGotError() {
  var theError = new Error("Missing scone");

  tryWith(undefined, false);
  tryWith(undefined, true);
  tryWith(theError, false);
  tryWith(theError, true);

  function tryWith(error, doData) {
    var source = new events.EventEmitter();
    var sink = new Sink(source);
    var coll = new EventCollector();

    assert.ok(!sink.gotError());
    coll.listenAllCommon(sink); // just to capture the error

    if (doData) {
      source.emit("data", "howdy");
      assert.ok(!sink.gotError());
    }

    source.emit("error", error);
    assert.ok(sink.gotError());
  }
}

function test() {
  constructor();
  constructorFailure();
  badEncodings();
  noInitialEvents();
  readableTransition();
  eventsAfterEnd();
  noDataEvents();
  singleDataEvent();
  multipleDataEvents();
  closeWithoutPayload();
  closeWithPayload();
  setEncoding();
  setIncomingEncoding();
  commonOptions();
  afterDestroy();
  destroyDuringResume();
  appropriateGetData();
  appropriateGetError();
  appropriateGotError();
}

module.exports = {
  test: test
};
