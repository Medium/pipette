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
function noWrite() {
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
function noWritePaused() {
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

/**
 * Test that empty writes don't cause any data events to be emitted.
 */
function emptyWrite() {
    testWith(new Buffer(0));
    testWith(new Buffer(0), undefined, true);

    testWith("");
    testWith("", undefined, true);
    testWith("", "utf8");
    testWith("", "utf8", true);

    function testWith(val, enc, onEnd) {
        var pipe = new Pipe();
        var coll = new EventCollector();

        coll.listenAllCommon(pipe.reader);
        coll.listenAllCommon(pipe.writer);

        if (onEnd) {
            pipe.writer.end(val, enc);
        } else {
            pipe.writer.write(val, enc);
            pipe.writer.end();
        }

        var evs = coll.events;
        for (var i = 0; i < evs.length; i++) {
            assert.notEqual(evs[i].name, "data");
        }
    }
}

/**
 * Test that a single non-empty write works.
 */
function oneWrite() {
    testWith(new Buffer("blort"));
    testWith(new Buffer("frobozz"), undefined, true);
    testWith("spaz");
    testWith("zorch", undefined, true);
    testWith("fnord", "utf8");
    testWith("fizmo", "utf8", true);
    testWith("0102030405060708090a", "hex");
    testWith("ffffffffff99999999998877661234", "hex", true);
    testWith("dGhpcyBpcyBhIHRlc3Q=", "base64");
    testWith("SSBhbSByYXRoZXIgZm9uZCBvZiBtdWZmaW5zLg==", "base64", true);

    function testWith(val, enc, onEnd) {
        var pipe = new Pipe();
        var coll = new EventCollector();

        coll.listenAllCommon(pipe.reader);
        coll.listenAllCommon(pipe.writer);

        if (onEnd) {
            pipe.writer.end(val, enc);
        } else {
            pipe.writer.write(val, enc);
            pipe.writer.end();
        }

        var evs = coll.events;
        var gotData = false;
        var buf = (typeof val === "string") ? new Buffer(val, enc) : val;

        for (var i = 0; i < evs.length; i++) {
            if (evs[i].name !== "data") {
                continue;
            }

            assert.ok(!gotData, "Too many data events");
            coll.assertEvent(i, pipe.reader, "data", [buf]);
            gotData = true;
        }

        assert.ok(gotData, "No data event");
    }
}

function test() {
    constructor();
    noWrite();
    noWritePaused();
    emptyWrite();
    oneWrite();
    // FIXME: More stuff goes here.
}

module.exports = {
    test: test
};
