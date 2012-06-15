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
 * Helper functions
 */

/**
 * Emit an event with an optional argument.
 */
function emit(target, name, arg) {
    if (arg !== undefined) {
        target.emit(name, arg);
    } else {
        target.emit(name);
    }
}


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
        assert.equal(coll.events.length, 1);
        assert.ok(!valve.readable);
    }
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

        emit(source, name, arg);
        assert.equal(coll.events.length, 1);
        coll.assertEvent(0, valve, name, arg ? [arg] : undefined);
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
        assert.equal(coll.events.length, 2);

        coll.assertEvent(0, valve, "data", ["whee"]);
        coll.assertEvent(1, valve, name, arg ? [arg] : undefined);
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
    eventsAfterEnd();
    bufferDataEvents();
    bufferEnders();
    eventsAfterResume();
    setEncoding();
    afterDestroy();
    destroyDuringResume();
}

module.exports = {
    test: test
};
