// Copyright 2012 The Obvious Corporation.

/*
 * Modules used
 */

"use strict";

var assert = require("assert");
var events = require("events");

var Blip = require("../").Blip;
var Dropper = require("../").Dropper;

var EventCollector = require("./eventcoll").EventCollector;
var emit = require("./emit").emit;


/*
 * Helper functions
 */

/**
 * Combines two buffers.
 */
function addBufs(buf1, buf2) {
  if (!buf1 || (buf1.length === 0)) {
    return buf2;
  }

  var length = buf1.length + buf2.length;
  var buf = new Buffer(length);

  buf1.copy(buf);
  buf2.copy(buf, buf1.length);
  return buf;
}


/*
 * Tests
 */

/**
 * Makes sure the constructor doesn't fail off the bat.
 */
function constructor() {
  new Dropper(new events.EventEmitter());
  new Dropper(new events.EventEmitter(), { size: 10 });
  new Dropper(new events.EventEmitter(), { allowMultiple: true });
  new Dropper(new events.EventEmitter(), { allowMultiple: false });
  new Dropper(new events.EventEmitter(), { ifPartial: "emit" });
  new Dropper(new events.EventEmitter(), { ifPartial: "error" });
  new Dropper(new events.EventEmitter(), { ifPartial: "ignore" });
  new Dropper(new events.EventEmitter(), { ifPartial: "pad" });
  new Dropper(new events.EventEmitter(),
              { size: 20, allowMultiple: true, ifPartial: "emit" });
}

/**
 * Tests expected constructor failures.
 */
function constructorFailure() {
  function f1() {
    new Dropper(undefined);
  }
  assert.throws(f1, /Missing source/);

  function f2() {
    new Dropper(["hello"]);
  }
  assert.throws(f2, /Source not an EventEmitter/);

  // This is an already-ended Stream-per-se.
  var bad = new Blip();
  bad.resume();

  function f3() {
    new Dropper(bad);
  }
  assert.throws(f3, /Source already ended./);

  function f4() {
    new Dropper(new events.EventEmitter(), { size: -1 });
  }
  assert.throws(f4, /Bad value for option: size/);

  function f5() {
    new Dropper(new events.EventEmitter(), { size: 0 });
  }
  assert.throws(f5, /Bad value for option: size/);

  function f6() {
    new Dropper(new events.EventEmitter(), { size: "yo" });
  }
  assert.throws(f6, /Bad value for option: size/);

  function f7() {
    new Dropper(new events.EventEmitter(), { allowMultiple: "hey" });
  }
  assert.throws(f7, /Bad value for option: allowMultiple/);

  function f8() {
    new Dropper(new events.EventEmitter(), { ifPartial: "blort" });
  }
  assert.throws(f8, /Bad value for option: ifPartial/);

  function f9() {
    new Dropper(new events.EventEmitter(), { encoding: "blort" });
  }
  assert.throws(f9, /Bad value for option: encoding/);

  function f10() {
    new Dropper(new events.EventEmitter(), { incomingEncoding: "blort" });
  }
  assert.throws(f10, /Bad value for option: incomingEncoding/);

  function f11() {
    new Dropper(new events.EventEmitter(), { paused: "blort" });
  }
  assert.throws(f11, /Bad value for option: paused/);

  function f12() {
    new Dropper(new events.EventEmitter(), { notARealOption: "yo" });
  }
  assert.throws(f12, /Unknown option: notARealOption/);
}

/**
 * Tests that `readable` is true until an end-type event comes through.
 */
function readableTransition() {
  tryWith("end");
  tryWith("close");
  tryWith("error", new Error("criminy"));

  function tryWith(name, arg) {
    var source = new events.EventEmitter();
    var dropper = new Dropper(source, { size: 10 });
    var coll = new EventCollector();

    dropper.pause();
    coll.listenAllCommon(dropper);
    assert.ok(dropper.readable);

    dropper.resume();
    assert.ok(dropper.readable);

    dropper.pause();
    assert.ok(dropper.readable);

    emit(source, name, arg);
    assert.ok(dropper.readable);
    assert.equal(coll.events.length, 0);

    dropper.resume();
    assert.equal(coll.events.length, 2);
    assert.ok(!dropper.readable);
  }
}

/**
 * Tests that no events will get passed through after a close sequence
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
    var dropper = new Dropper(source, { size: 10 });
    var coll = new EventCollector();

    coll.listenAllCommon(dropper);

    if (doError) {
      source.emit("error", theError);
    } else {
      source.emit("end");
    }

    assert.equal(coll.events.length, 2);

    if (doError) {
      coll.assertEvent(0, dropper, "error", [theError]);
    } else {
      coll.assertEvent(0, dropper, "end");
    }

    coll.assertEvent(1, dropper, "close");
    coll.reset();

    // In case the event to be sent is an `error`, this listener
    // suppresses the Node default "unhandled error" behavior.
    source.on("error", function () { /*ignore*/ });

    emit(source, name, arg);
    assert.equal(coll.events.length, 0);
  }
}

/**
 * Tests basic non-multiple event sequence, using various block sizes.
 */
function nonMultipleEventSequence() {
  var rawData = new Buffer(50000);
  rawData[0] = 0;
  rawData[1] = 1;
  for (var i = 2; i < rawData.length; i++) {
    rawData[i] = (i + rawData[i - 2] + rawData[i - 1]) & 0xff;
  }

  for (var i = 1; i < 500; i += 27) {
    tryWith(i);
  }

  function tryWith(blockSize) {
    var source = new events.EventEmitter();
    var dropper = new Dropper(source, { size: blockSize });
    var coll = new EventCollector();

    var data = rawData;
    var pending = undefined; // expected pending data
    var nextLength = 1;

    coll.listenAllCommon(dropper);

    while (data.length !== 0) {
      if (nextLength > data.length) {
        nextLength = data.length;
      }

      var emitData = data.slice(0, nextLength);
      data = data.slice(nextLength);
      pending = addBufs(pending, emitData);

      var expectedEventCount = Math.floor(pending.length / blockSize);
      source.emit("data", emitData);

      assert.equal(coll.events.length, expectedEventCount);
      for (var i = 0; i < expectedEventCount; i++) {
        var expectData = pending.slice(0, blockSize);
        pending = pending.slice(blockSize);
        coll.assertEvent(i, dropper, "data", [expectData]);
      }

      coll.reset();
    }

    source.emit("end");

    if (pending.length === 0) {
      assert.equal(coll.events.length, 2);
      coll.assertEvent(0, dropper, "end");
      coll.assertEvent(1, dropper, "close");
    } else {
      assert.equal(coll.events.length, 3);
      coll.assertEvent(0, dropper, "data", [pending]);
      coll.assertEvent(1, dropper, "end");
      coll.assertEvent(2, dropper, "close");
    }
  }
}

/**
 * Tests basic multiple-okay event sequence, using various block sizes.
 */
function multipleOkayEventSequence() {
  var rawData = new Buffer(50000);
  rawData[0] = 10;
  rawData[1] = 12;
  for (var i = 2; i < rawData.length; i++) {
    rawData[i] = (i + rawData[i - 2] + rawData[i - 1]) & 0xff;
  }

  for (var i = 1; i < 500; i += 27) {
    tryWith(i);
  }

  function tryWith(blockSize) {
    var source = new events.EventEmitter();
    var dropper = new Dropper(source, { size: blockSize });
    var coll = new EventCollector();

    var data = rawData;
    var pending = undefined; // expected pending data
    var nextLength = 1;

    coll.listenAllCommon(dropper);

    while (data.length !== 0) {
      if (nextLength > data.length) {
        nextLength = data.length;
      }

      var emitData = data.slice(0, nextLength);
      data = data.slice(nextLength);
      pending = addBufs(pending, emitData);

      var expectEvent = (pending.length >= blockSize);
      source.emit("data", emitData);

      assert.equal(coll.events.length, expectEvent ? 1 : 0);
      if (expectEvent) {
        var expectLength = (pending.length - pending.length % blockSize);
        var expectData = pending.slice(0, expectLength);
        pending = pending.slice(expectLength);
        coll.assertEvent(0, dropper, "data", [expectData]);
        coll.reset();
      }
    }

    source.emit("end");

    if (pending.length === 0) {
      assert.equal(coll.events.length, 2);
      coll.assertEvent(0, dropper, "end");
      coll.assertEvent(1, dropper, "close");
    } else {
      assert.equal(coll.events.length, 3);
      coll.assertEvent(0, dropper, "data", [pending]);
      coll.assertEvent(1, dropper, "end");
      coll.assertEvent(2, dropper, "close");
    }
  }
}

/**
 * Tests the basic error event sequence.
 */
function errorSequence() {
  var source = new events.EventEmitter();
  var dropper = new Dropper(source, { size: 25 });
  var coll = new EventCollector();

  coll.listenAllCommon(dropper);

  source.emit("data", "Muffins are a perfect source of nutritive value.");
  source.emit("error", new Error("oy"));
  assert.equal(coll.events.length, 4);

  coll.assertEvent(0, dropper, "data",
                   [new Buffer("Muffins are a perfect sou")]);
  coll.assertEvent(1, dropper, "data",
                   [new Buffer("rce of nutritive value.")]);
  coll.assertEvent(2, dropper, "error",
                   [new Error("oy")]);
  coll.assertEvent(3, dropper, "close");
}

/**
 * Tests a buffered (because of `pause()`) event sequence.
 */
function bufferedSequence() {
  var source = new events.EventEmitter();
  var dropper = new Dropper(source, { size: 20 });
  var coll = new EventCollector();

  coll.listenAllCommon(dropper);
  dropper.pause();

  source.emit("data", "This ");
  source.emit("data", "is ");
  source.emit("data", "a ");
  source.emit("data", "test ");
  source.emit("data", "of ");
  source.emit("data", "the ");
  source.emit("data", "emergency ");
  source.emit("data", "broadcast ");
  source.emit("data", "system.");
  source.emit("end");

  assert.ok(dropper.readable);
  dropper.resume();
  assert.ok(!dropper.readable);

  assert.equal(coll.events.length, 5);
  coll.assertEvent(0, dropper, "data", [new Buffer("This is a test of th")]);
  coll.assertEvent(1, dropper, "data", [new Buffer("e emergency broadcas")]);
  coll.assertEvent(2, dropper, "data", [new Buffer("t system.")]);
  coll.assertEvent(3, dropper, "end");
  coll.assertEvent(4, dropper, "close");
}

/**
 * Tests the various `ifPartial` values.
 */
function ifPartial() {
  var theData = new Buffer("yummy");
  var source = new events.EventEmitter();
  var coll = new EventCollector();
  var dropper;

  tryWith("emit");
  assert.equal(coll.events.length, 3);
  coll.assertEvent(0, dropper, "data", [theData]);
  coll.assertEvent(1, dropper, "end");
  coll.assertEvent(2, dropper, "close");

  tryWith("error");
  assert.equal(coll.events.length, 2);
  coll.assertEvent(0, dropper, "error", [new Error("Partial buffer at end.")]);
  coll.assertEvent(1, dropper, "close");

  tryWith("ignore");
  coll.assertEvent(0, dropper, "end");
  coll.assertEvent(1, dropper, "close");

  tryWith("pad");
  assert.equal(coll.events.length, 3);
  coll.assertEvent(0, dropper, "data", [new Buffer("yummy\0\0\0\0\0")]);
  coll.assertEvent(1, dropper, "end");
  coll.assertEvent(2, dropper, "close");

  function tryWith(partial) {
    dropper = new Dropper(source, { size: 10, ifPartial: partial });
    coll.reset();
    coll.listenAllCommon(dropper);
    source.emit("data", theData);
    source.emit("close");
  }
}

/**
 * Tests that `setEncoding()` operates as expected in terms of baseline
 * functionality.
 */
function setEncoding() {
  var source = new events.EventEmitter();
  var dropper = new Dropper(source, { size: 6 });
  var coll = new EventCollector();

  coll.listenAllCommon(dropper);

  tryWith(undefined);
  tryWith("ascii");
  tryWith("base64");
  tryWith("hex");
  tryWith("utf8");

  function tryWith(name) {
    var origData = new Buffer("muffintastic");
    var expectData1 = origData.slice(0, 6);
    var expectData2 = origData.slice(6);

    if (name) {
      expectData1 = expectData1.toString(name);
      expectData2 = expectData2.toString(name);
    }

    dropper.setEncoding(name);
    source.emit("data", origData);
    assert.equal(coll.events.length, 2);
    coll.assertEvent(0, dropper, "data", [expectData1]);
    coll.assertEvent(1, dropper, "data", [expectData2]);
    coll.reset();
  }
}

/**
 * Tests that `setIncomingEncoding()` operates as expected in terms of
 * baseline functionality.
 */
function setIncomingEncoding() {
  var source = new events.EventEmitter();
  var dropper = new Dropper(source, { size: 35 });
  var coll = new EventCollector();

  coll.listenAllCommon(dropper);

  tryWith(undefined);
  tryWith("ascii");
  tryWith("base64");
  tryWith("hex");
  tryWith("utf8");

  assert.equal(coll.events.length, 1);
  coll.assertEvent(0, dropper, "data",
                   [new Buffer("biscuitbiscuitbiscuitbiscuitbiscuit")]);

  function tryWith(name) {
    var origData = new Buffer("biscuit");
    var emitData;

    if (name) {
      emitData = origData.toString(name);
    } else {
      emitData = origData;
    }

    dropper.setIncomingEncoding(name);
    source.emit("data", emitData);
  }
}

/**
 * Tests the common constructor options.
 */
function commonOptions() {
  var theData = new Buffer("scone");
  var source = new events.EventEmitter();
  var dropper = new Dropper(source,
                            { size: 5,
                              encoding: "hex", 
                              incomingEncoding: "base64",
                              paused: true });
  var coll = new EventCollector();

  coll.listenAllCommon(dropper);
  
  source.emit("data", theData.toString("base64"));
  source.emit("end");
  source.emit("close");
  assert.ok(dropper.readable);
  assert.equal(coll.events.length, 0);

  dropper.resume();
  assert.ok(!dropper.readable);
  assert.equal(coll.events.length, 3);
  coll.assertEvent(0, dropper, "data", [theData.toString("hex")]);
  coll.assertEvent(1, dropper, "end");
  coll.assertEvent(2, dropper, "close");
}

/**
 * Ensure that no events get passed after a `destroy()` call. Also,
 * proves that the dropper isn't even listening for events from the
 * source anymore.
 */
function afterDestroy() {
  var source = new events.EventEmitter();
  var dropper = new Dropper(source, { size: 100 });
  var coll = new EventCollector();

  coll.listenAllCommon(dropper);
  dropper.destroy();
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
 * Ensure that things don't go haywire if a dropper is destroyed in the
 * middle of being resumed.
 */
function destroyDuringResume() {
  var theData = new Buffer("stuff");
  var source = new events.EventEmitter();
  var dropper = new Dropper(source, { size: 5 });
  var coll = new EventCollector();

  dropper.pause();
  coll.listenAllCommon(dropper);
  source.emit("data", theData);
  source.emit("end");

  dropper.on("data", function() { dropper.destroy(); });
  dropper.resume();

  assert.equal(coll.events.length, 1);
  coll.assertEvent(0, dropper, "data", [theData]);
}

function test() {
  constructor();
  constructorFailure();
  readableTransition();
  eventsAfterClose();
  nonMultipleEventSequence();
  multipleOkayEventSequence();
  errorSequence();
  bufferedSequence();
  ifPartial();
  setEncoding();
  setIncomingEncoding();
  commonOptions();
  afterDestroy();
  destroyDuringResume();
}

module.exports = {
  test: test
};
