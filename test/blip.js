// Copyright 2012 The Obvious Corporation.

/*
 * Modules used
 */

"use strict";

var assert = require("assert");
var events = require("events");
var typ = require("typ");

var Blip = require("../").Blip;

var EventCollector = require("./eventcoll").EventCollector;


/*
 * Tests
 */

/**
 * Make sure the constructor doesn't fail off the bat.
 */
function constructor() {
  new Blip();
  new Blip("hello");
  new Blip(new Buffer(10));
  new Blip("hello", {});
  new Blip("hello", { encoding: "utf8" });
  new Blip("hello", { incomingEncoding: "utf8" });
}

/**
 * Test expected constructor failures.
 */
function constructorFailure() {
  function f1() {
    new Blip(["hello"]);
  }
  assert.throws(f1, /Data not a string or buffer/);

  function f2() {
    new Blip(undefined, { paused: false });
  }
  assert.throws(f2, /Unknown option: paused/);

  function f3() {
    new Blip(undefined, { encoding: 12 });
  }
  assert.throws(f3, /Bad value for option: encoding/);

  function f4() {
    new Blip(undefined, { incomingEncoding: "zorch" });
  }
  assert.throws(f4, /Bad value for option: incomingEncoding/);
}

/**
 * Test the basic event sequence.
 */
function basicEventSequence() {
  var theData = new Buffer("blort");
  var blip = new Blip(theData);
  var coll = new EventCollector();

  coll.listenAllCommon(blip);
  blip.resume();

  assert.equal(coll.events.length, 3);
  coll.assertEvent(0, blip, "data", [theData]);
  coll.assertEvent(1, blip, "end");
  coll.assertEvent(2, blip, "close");
}

/**
 * Test the event sequence for the no-data case.
 */
function noDataEventSequence() {
  var blip = new Blip();
  var coll = new EventCollector();

  coll.listenAllCommon(blip);
  blip.resume();

  assert.equal(coll.events.length, 2);
  coll.assertEvent(0, blip, "end");
  coll.assertEvent(1, blip, "close");
}

/**
 * Test that the edge cases of empty (but defined) data values in
 * fact cause `data` events to be emitted.
 */
function edgeCaseEvents() {
  tryWith("");
  tryWith(new Buffer(0));

  function tryWith(data) {
    var blip = new Blip(data);
    var coll = new EventCollector();
    var expectData = typ.isBuffer(data) ? data : new Buffer(data);

    coll.listenAllCommon(blip);
    blip.resume();

    assert.equal(coll.events.length, 3);
    coll.assertEvent(0, blip, "data", [expectData]);
    // Assume the other two are as expected (already independently tested)
  }
}

/**
 * Test that `readable` is true before events were emitted and false
 * afterwards.
 */
function readableTransition() {
  var blip = new Blip("blort");

  assert.ok(blip.readable);
  blip.resume();
  assert.ok(!blip.readable);
}

/**
 * Tests that `setEncoding()` operates as expected.
 */
function setEncoding() {
  var blip = new Blip("frotz");
  var coll = new EventCollector();

  coll.listenAllCommon(blip);
  blip.setEncoding("ascii");
  blip.resume();

  assert.equal(coll.events.length, 3);
  coll.assertEvent(0, blip, "data", ["frotz"]);
}

/**
 * Tests the common constructor options.
 */
function commonOptions() {
  var theData = new Buffer("scone");
  var blip = new Blip(theData.toString("base64"),
                      { encoding: "hex", 
                        incomingEncoding: "base64" });
  var coll = new EventCollector();

  coll.listenAllCommon(blip);
  assert.ok(blip.readable);
  assert.equal(coll.events.length, 0);
  blip.resume();
  
  assert.ok(!blip.readable);
  assert.equal(coll.events.length, 3);
  coll.assertEvent(0, blip, "data", [theData.toString("hex")]);
  coll.assertEvent(1, blip, "end");
  coll.assertEvent(2, blip, "close");
}

/**
 * Ensure that no events get passed after a `destroy()` call.
 */
function afterDestroy() {
  tryWith(new Blip("fizmo"));
  tryWith(new Blip());

  function tryWith(blip) {
    var coll = new EventCollector();

    coll.listenAllCommon(blip);
    blip.destroy();

    assert.equal(coll.events.length, 0);
    blip.resume();
    assert.equal(coll.events.length, 0);
  }
}

/**
 * Ensure that things don't go haywire if a blip is destroyed in the
 * middle of being resumed.
 */
function destroyDuringResume() {
  var blip = new Blip("victimized");
  var coll = new EventCollector();

  coll.listenAllCommon(blip);
  blip.on("data", function() { blip.destroy(); });
  blip.resume();

  assert.equal(coll.events.length, 3);
  // Assume they're the three expected events, as tested elsewhere.
}

function test() {
  constructor();
  constructorFailure();
  basicEventSequence();
  noDataEventSequence();
  edgeCaseEvents();
  readableTransition();
  setEncoding();
  commonOptions();
  afterDestroy();
  destroyDuringResume();
}

module.exports = {
  test: test
};
