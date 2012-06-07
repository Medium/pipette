// Copyright 2012 The Obvious Corporation.

/*
 * Modules used
 */

"use strict";

var assert = require("assert");
var events = require("events");
var stream = require("stream");

var Pipe = require("../").Pipe;

var EventCollector = require("./eventcoll").EventCollector;


/*
 * Tests
 */

/**
 * Make sure the constructor doesn't blow up, and that the result
 * provides the expected members.
 */
function constructor() {
    var pipe = new Pipe();

    assert.ok(pipe.reader);
    assert.ok(pipe.writer);
    assert.ok(pipe.reader instanceof stream.Stream);
    assert.ok(pipe.writer instanceof events.EventEmitter);

    new Pipe(false);
    new Pipe(true);
}

/**
 * Test the event sequence for a never-written-to pipe.
 */
function empty() {
    testWith("end");
    testWith("destroy");
    testWith("destroySoon");

    function testWith(enderName) {
        var pipe = new Pipe();
        var coll = new EventCollector();

        coll.listenAllCommon(pipe.reader);
        coll.listenAllCommon(pipe.writer);

        assert.equal(coll.events.length, 0);
        pipe.writer[enderName].call(pipe.writer);
        assert.equal(coll.events.length, 3);

        coll.assertEvent(0, pipe.reader, "end");
        coll.assertEvent(1, pipe.reader, "close");
        coll.assertEvent(2, pipe.writer, "close");
    }
}

/**
 * Test the event sequence for a never-written-to pipe that gets ended
 * while paused.
 */
function emptyPaused() {
    testWith("end");
    testWith("destroy");
    testWith("destroySoon");

    function testWith(enderName) {
        var pipe = new Pipe(true);
        var coll = new EventCollector();

        coll.listenAllCommon(pipe.reader);
        coll.listenAllCommon(pipe.writer);

        assert.equal(coll.events.length, 0);
        pipe.writer[enderName].call(pipe.writer);
        assert.equal(coll.events.length, 1);

        coll.assertEvent(0, pipe.writer, "close");
        coll.reset();

        pipe.reader.resume();

        assert.equal(coll.events.length, 3);
        coll.assertEvent(0, pipe.writer, "drain");
        coll.assertEvent(1, pipe.reader, "end");
        coll.assertEvent(2, pipe.reader, "close");
    }
}

function test() {
    constructor();
    empty();
    emptyPaused();
    // FIXME: More stuff goes here.
}

module.exports = {
    test: test
};
