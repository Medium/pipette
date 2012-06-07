// Copyright 2012 The Obvious Corporation.

/*
 * Modules used
 */

"use strict";

var assert = require("assert");
var events = require("events");

var Valve = require("../").Valve;

var EventCollector = require("./eventcoll").EventCollector;


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
 * Test that only `close` and `error` will get passed through after an
 * `end` event. Also, check that nothing at all gets passed through after
 * `close` or `error`.
 */
function eventsAfterEnd() {
    tryWith("close");
    tryWith("error", new Error("oy"));

    function tryWith(name, arg) {
        var source = new events.EventEmitter();
        var valve = new Valve(source, false);
        var coll = new EventCollector();

        coll.listenAllCommon(valve);
        source.emit("end");
        assert.equal(coll.events.length, 1);
        coll.assertEvent(0, valve, "end");
        coll.reset();

        source.emit("data", "hmph");
        assert.equal(coll.events.length, 0);

        source.emit("end");
        assert.equal(coll.events.length, 0);

        var expectArg = undefined;
        if (arg) {
            source.emit(name, arg);
            expectArg = [arg];
        } else {
            source.emit(name);
        }
        assert.equal(coll.events.length, 1);
        coll.assertEvent(0, valve, name, expectArg);
        coll.reset();

        source.emit("data", "hmph");
        assert.equal(coll.events.length, 0);

        source.emit("end");
        assert.equal(coll.events.length, 0);

        source.emit("close");
        assert.equal(coll.events.length, 0);

        source.emit("error");
        assert.equal(coll.events.length, 0);
    }
}

function test() {
    constructor();
    needSource();
    noInitialEvents();
    eventsAfterEnd();
    // FIXME: More stuff goes here.
}

module.exports = {
    test: test
};
