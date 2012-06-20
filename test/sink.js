// Copyright 2012 The Obvious Corporation.

/*
 * Modules used
 */

"use strict";

var assert = require("assert");
var events = require("events");

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
}

/**
 * Test expected constructor failures.
 */
function needSource() {
    function f1() {
        new Sink();
    }
    assert.throws(f1, /Missing source/);

    function f2() {
        new Sink(["hello"]);
    }
    assert.throws(f2, /Source not an EventEmitter/);
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

        assert.equal(coll.events.length, (name === "error") ? 1 : 2);
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
        assert.equal(coll.events.length, (name === "error") ? 1 : 2);
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

        assert.equal(coll.events.length, isError ? 1 : 2);

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

        assert.equal(coll.events.length, isError ? 2 : 3);
        coll.assertEvent(0, sink, "data", [theData]);

        if (isError) {
            coll.assertEvent(1, sink, "error", [endArg]);
        } else {
            coll.assertEvent(1, sink, "end", undefined);
            coll.assertEvent(2, sink, "close", undefined);
        }
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
 * Check that emit-side encoding works as expected.
 */
function setEncoding() {
    tryWith(undefined);
    tryWith("ascii");
    tryWith("utf-8");
    tryWith("base64");

    function tryWith(name) {
        var source = new events.EventEmitter();
        var sink = new Sink(source);
        var coll = new EventCollector();

        coll.listenAllCommon(sink);
        source.emit("data", "testing");
        source.emit("data", "123");
        source.emit("end");

        var expect = new Buffer("testing123");
        if (name) {
            expect = expect.toString(name);
        }

        coll.assertEvent(0, sink, "data", [expect]);
        coll.assertEvent(1, sink, "end", undefined);
        coll.assertEvent(2, sink, "close", undefined);
    }
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

function test() {
    constructor();
    needSource();
    noInitialEvents();
    readableTransition();
    eventsAfterEnd();
    noDataEvents();
    singleDataEvent();
    multipleDataEvents();
    setEncoding();
    afterDestroy();
    destroyDuringResume();
}

module.exports = {
    test: test
};
