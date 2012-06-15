// Copyright 2012 The Obvious Corporation.

/*
 * Modules used
 */

"use strict";

var assert = require("assert");
var events = require("events");

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
}

/**
 * Test expected constructor failures.
 */
function needData() {
    function f() {
        new Blip(["hello"]);
    }
    assert.throws(f, /Data not a string or buffer/);
}

/**
 * Test the basic event sequence.
 */
function basicEventSequence() {
    var blip = new Blip("blort");
    var coll = new EventCollector();

    coll.listenAllCommon(blip);
    blip.resume();

    assert.equal(coll.events.length, 3);
    coll.assertEvent(0, blip, "data", ["blort"]);
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

        coll.listenAllCommon(blip);
        blip.resume();

        assert.equal(coll.events.length, 3);
        coll.assertEvent(0, blip, "data", [data]);
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
 * Just demonstrate that we don't expect `setEncoding()` to operate.
 */
function setEncoding() {
    var blip = new Blip("frotz");

    function f() {
        blip.setEncoding("ascii");
    }

    assert.throws(f, /setEncoding\(\) not supported/);
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

function test() {
    constructor();
    needData();
    basicEventSequence();
    noDataEventSequence();
    edgeCaseEvents();
    readableTransition();
    setEncoding();
    afterDestroy();
}

module.exports = {
    test: test
};
