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
 * Makes sure the constructor doesn't fail off the bat.
 */
function constructor() {
  var emitter = new events.EventEmitter();

  new Slicer(emitter);
  new Slicer(emitter, {});
  new Slicer(emitter, { incomingEncoding: "hex" });
}

/**
 * Tests expected constructor failures.
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
    new Slicer(new events.EventEmitter(), { incomingEncoding: "bad-encoding" });
  }
  assert.throws(f3, /Bad value for option: incomingEncoding/);

  function f4() {
    new Slicer(new events.EventEmitter(), { frobnitz: "fizmo" });
  }
  assert.throws(f4, /Unknown option: frobnitz/);
}

/**
 * Tests the transition from readable to un-readable. This also checks
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
  tryWith(true, "close", true);
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
      coll.assertCallback(0, false, theData.length, theData, 0);
    }

    assert.ok(!slicer.readable);

    // Also make sure that a pending error is "readable".
    if (endArg) {
      coll.reset();
      slicer.readAll(coll.callback);
      assert.equal(coll.callbacks.length, 1);
      coll.assertCallback(0, true, 0, new Buffer(0), 0);
    }
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

    coll.assertCallback(0, true, theData.length, theData, 0);
    for (var i = 1; i < count; i++) {
      coll.assertCallback(i, true, 0, new Buffer(0), 0);
    }
  }
}

/**
 * Tests that `getError()` and `gotError()` work as expected.
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
      coll.assertCallback(0, false, theData.length, theData, 0);
      coll.callbacks.shift();
    }

    assert.equal(coll.callbacks.length, count);

    for (var i = 0; i < count; i++) {
      coll.assertCallback(i, false, 0, new Buffer(0), 0);
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
  coll.assertCallback(0, false, theData.length, theData, 0);
  coll.assertCallback(1, false, 0, new Buffer(0), 0);
}

/**
 * Tests the case of a `readAll()` that grabs the end chunk of
 * some data behind a fixed-length `read()`.
 */
function readAllAfterReadWithLength() {
  var theData = new Buffer("Try the shortbread.");
  var data0 = theData.slice(0, 10);
  var data1 = theData.slice(10);

  var source = new events.EventEmitter();
  var slicer = new Slicer(source);
  var coll = new CallbackCollector();

  slicer.read(10, coll.callback);
  slicer.readAll(coll.callback);

  assert.equal(coll.callbacks.length, 0);
  source.emit("data", theData);
  assert.equal(coll.callbacks.length, 2);

  coll.assertCallback(0, false, data0.length, data0, 0);
  coll.assertCallback(1, false, data1.length, data1, 0);
}

/**
 * Tests that `read()` with length 0 always succeeds when it's
 * first in the queue.
 */
function readWithZeroLength() {
  var theData = new Buffer("Banana nut muffins: total travesty");

  var source = new events.EventEmitter();
  var slicer = new Slicer(source);
  var coll = new CallbackCollector();

  // Test with an empty read queue and nothing pending.
  slicer.read(0, coll.callback);
  assert.equal(coll.callbacks.length, 1);
  coll.assertCallback(0, false, 0, new Buffer(0), 0);
  coll.reset();

  // Test with an empty read queue and some data pending.
  source.emit("data", theData);
  slicer.read(0, coll.callback);
  assert.equal(coll.callbacks.length, 1);
  coll.assertCallback(0, false, 0, new Buffer(0), 0);
  coll.reset();

  // Test with a non-empty read queue and an initial read that
  // doesn't end up consuming all the data.
  slicer = new Slicer(source);
  slicer.read(10, coll.callback);
  slicer.read(0, coll.callback);
  source.emit("data", theData);
  assert.equal(coll.callbacks.length, 2);
  coll.assertCallback(0, false, 10, theData.slice(0, 10), 0);
  coll.assertCallback(1, false, 0, new Buffer(0), 0);
  coll.reset();

  // Test with a non-empty read queue and an initial read that
  // *does* end up consuming all the data.
  slicer = new Slicer(source);
  slicer.read(theData.length, coll.callback);
  slicer.read(0, coll.callback);
  source.emit("data", theData);
  assert.equal(coll.callbacks.length, 2);
  coll.assertCallback(0, false, theData.length, theData, 0);
  coll.assertCallback(1, false, 0, new Buffer(0), 0);
}

/**
 * Tests a spectrum of cases of reading, where the requested
 * size of the reads and the size of the buffers passed through in
 * data events vary. This is meant to cover cases where the length
 * to be read is larger, the same, and smaller than the length of
 * the buffers being emitted in events.
 */
function readLengthSpectrum() {
  var EMIT_COUNT = 200;

  for (var readLength = 1; readLength < 100; readLength += 7) {
    for (var emitLength = 1; emitLength < 100; emitLength += 7) {
      tryWith(readLength, emitLength);
    }
  }

  function tryWith(readLength, emitLength) {
    var source = new events.EventEmitter();
    var slicer = new Slicer(source);
    var coll = new CallbackCollector();

    var buffer = makeEmitBuf(EMIT_COUNT * emitLength);
    doEmit(source, buffer, emitLength);

    while (buffer.length >= readLength) {
      var expectBuf = buffer.slice(0, readLength);
      slicer.read(readLength, coll.callback);
      assert.equal(coll.callbacks.length, 1);
      coll.assertCallback(0, false, readLength, expectBuf, 0);
      coll.reset();
      buffer = buffer.slice(readLength);
    }
  }

  function doEmit(source, buffer, emitLength) {
    while (buffer.length !== 0) {
      source.emit("data", buffer.slice(0, emitLength));
      buffer = buffer.slice(emitLength);
    }
  }

  function makeEmitBuf(length) {
    var result = new Buffer(length);
    var ch = 0x41; // 'A'
    for (var i = 0; i < length; i++) {
      result[i] = ch;
      ch++;
      if (ch > 0x5a /* 'Z' */) {
        ch = 0x41;
      }
    }

    return result;
  }
}

/**
 * Tests the various argument options of `readInto()`.
 */
function readInto() {
  var theData = new Buffer("Strawberry cupcakes: surprisingly delicious");

  var source = new events.EventEmitter();
  var slicer = new Slicer(source);
  var coll = new CallbackCollector();
  var target = new Buffer(10);

  target.fill(0x61);

  // Test a zero-length read. The callback's offset should correspond.
  source.emit("data", theData);
  slicer.readInto(target, 5, 0, coll.callback);
  assert.equal(coll.callbacks.length, 1);
  coll.assertCallback(0, false, 0, target, 5);
  assert.strictEqual(coll.callbacks[0].buffer, target);

  slicer = new Slicer(source);
  coll.reset();

  // Test reading the entire buffer.
  source.emit("data", theData);
  slicer.readInto(target, 0, undefined, coll.callback);
  assert.equal(coll.callbacks.length, 1);
  coll.assertCallback(0, false, 10, theData.slice(0, 10), 0);
  assert.strictEqual(coll.callbacks[0].buffer, target);

  slicer = new Slicer(source);
  coll.reset();
  target.fill(0x61);

  // Test reading from the middle to the end of the buffer, with
  // `undefined` length.
  source.emit("data", theData);
  slicer.readInto(target, 3, undefined, coll.callback);
  assert.equal(coll.callbacks.length, 1);
  coll.assertCallback(0, false, 7, target, 3);
  assert.equal(target, "aaaStrawbe");
  assert.strictEqual(coll.callbacks[0].buffer, target);

  slicer = new Slicer(source);
  coll.reset();
  target.fill(0x61);

  // Test reading from the middle to the end of the buffer, with
  // precisely-correct length.
  source.emit("data", theData);
  slicer.readInto(target, 6, undefined, coll.callback);
  assert.equal(coll.callbacks.length, 1);
  coll.assertCallback(0, false, 4, target, 6);
  assert.equal(target, "aaaaaaStra");
  assert.strictEqual(coll.callbacks[0].buffer, target);
}

/**
 * Tests that a length-specified read at the end of the stream ends up
 * succeeding as a partial read or an error read (as appropriate).
 */
function partialRead() {
  tryWith("end");
  tryWith("close");
  tryWith("close", true);
  tryWith("close", new Error("yowtch"));
  tryWith("error");
  tryWith("error", false);
  tryWith("error", new Error("craziness"));

  function tryWith(endEvent, endArg) {
    var theData = new Buffer("ice cream");

    var source = new events.EventEmitter();
    var slicer = new Slicer(source);
    var coll = new CallbackCollector();

    var expectError = (endEvent === "error") || (endArg !== undefined);

    slicer.read(1000, coll.callback);
    slicer.read(1, coll.callback);
    slicer.readAll(coll.callback);
    source.emit("data", theData);
    assert.equal(coll.callbacks.length, 0);

    emit(source, endEvent, endArg);
    assert.equal(coll.callbacks.length, 3);

    coll.assertCallback(0, true, theData.length, theData, 0);
    coll.assertCallback(1, true, 0, new Buffer(0), 0);
    coll.assertCallback(2, expectError, 0, new Buffer(0), 0);
  }
}

/**
 * Tests that the initial incoming data encoding works as expected.
 */
function constructorEncodings() {
  tryWith("ascii", "muffin");
  tryWith("base64", new Buffer("biscuit").toString("base64"));
  tryWith("hex", new Buffer("scone").toString("hex"));
  tryWith("ucs2", "cupcake");
  tryWith("utf16le", "croissant");
  tryWith("utf8", "bear claw");

  function tryWith(encodingName, dataString) {
    var source = new events.EventEmitter();
    var slicer = new Slicer(source, { incomingEncoding: encodingName });
    var coll = new CallbackCollector();

    if (encodingName === "utf16le") {
      // For compatibility with Node 0.6.*.
      encodingName = "ucs2";
    }
    var expectData = new Buffer(dataString, encodingName);

    source.emit("data", dataString);
    slicer.readAll(coll.callback);
    assert.equal(coll.callbacks.length, 1);
    coll.assertCallback(0, false, expectData.length, expectData, 0);
  }
}

/**
 * Tests that `setIncomingEncoding()` works as expected, particularly
 * that it applies only to subsequently-received `data` events.
 */
function setIncomingEncoding() {
  var source = new events.EventEmitter();
  var slicer = new Slicer(source);
  var coll = new CallbackCollector();

  var expectData = new Buffer(0);
  addExpect("ascii", "dark chocolate.");
  addExpect("base64", new Buffer("milk chocolate. ").toString("base64"));
  addExpect("hex", new Buffer("white chocolate. ").toString("hex"));
  addExpect("ucs2", "German white chocolate, with almonds. ");
  addExpect("utf16le", "extra dark chocolate. ");
  addExpect("utf8", "caramel.");

  slicer.readAll(coll.callback);
  assert.equal(coll.callbacks.length, 1);
  coll.assertCallback(0, false, expectData.length, expectData, 0);

  function addExpect(encodingName, dataString) {
    slicer.setIncomingEncoding(encodingName);
    source.emit("data", dataString);

    if (encodingName === "utf16le") {
      // For compatibility with Node 0.6.*.
      encodingName = "ucs2";
    }

    var buf = new Buffer(dataString, encodingName);
    var newExpect = new Buffer(expectData.length + buf.length);
    expectData.copy(newExpect);
    buf.copy(newExpect, expectData.length);
    expectData = newExpect;
  }
}

/**
 * Makes sure callbacks aren't getting unintentionally reused. (The
 * other multi-callback test cases end up intentionally reusing
 * callbacks, for programmer convenience.)
 */
function noCallbackReuse() {
  var theData = new Buffer("cannelle");

  var source = new events.EventEmitter();
  var slicer = new Slicer(source);
  var colls = [];

  for (var i = 0; i < 20; i++) {
    colls[i] = new CallbackCollector();
    slicer.read(1, colls[i].callback);
  }

  source.emit("data", theData);
  source.emit("end");

  for (i = 0; i < colls.length; i++) {
    var one = colls[i];
    var expectError = (i >= theData.length);
    var expectBuf = expectError ? new Buffer(0) : theData.slice(i, i + 1);

    assert.equal(one.callbacks.length, 1);
    one.assertCallback(0, expectError, expectBuf.length, expectBuf, 0);
  }
}

/**
 * Makes sure that callbacks aren't called with anything other than
 * a default `this`.
 */
function callbackThis() {
  var source = new events.EventEmitter();
  var slicer = new Slicer(source);
  var count = 0;

  source.emit("data", "sufficiently tasty muffins");

  // These are meant to cover all the various ways a callback might be
  // triggered.

  slicer.read(1, callback);
  slicer.read(0, callback);
  slicer.readInto(new Buffer(5), 0, 5, callback);
  slicer.readAll(callback);
  slicer.read(0, callback);

  source.emit("error", new Error("Insufficient tastiness after all!"));

  slicer.read(0, callback);
  slicer.read(1, callback);
  slicer.readAll(callback);
  slicer.readInto(new Buffer(1), 0, 1, callback);

  assert.equal(count, 9, "Missing callback.");

  function callback(/*ignored*/) {
    count++;
    assert.equal(this, undefined, "Bogus `this` in callback.");
  }
}

function test() {
  constructor();
  constructorFailures();
  readableTransition();
  destroy();
  getErrorGotError();
  readAllNoData();
  readAllImmediateData();
  readAllAfterReadWithLength();
  readWithZeroLength();
  readLengthSpectrum();
  readInto();
  partialRead();
  constructorEncodings();
  setIncomingEncoding();
  noCallbackReuse();
  callbackThis();
}

module.exports = {
  test: test
};
