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
    testWith("muffins", "ascii");
    testWith("biscuits", "ascii", true);
    testWith("dGhpcyBpcyBhIHRlc3Q=", "base64");
    testWith("SSBhbSByYXRoZXIgZm9uZCBvZiBtdWZmaW5zLg==", "base64", true);
    testWith("0102030405060708090a", "hex");
    testWith("ffffffffff99999999998877661234", "hex", true);

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
        var gotEnder = false;
        var buf = (typeof val === "string") ? new Buffer(val, enc) : val;

        for (var i = 0; i < evs.length; i++) {
            switch (evs[i].name) {
                case "end":
                case "close": {
                    gotEnder = true;
                    break;
                }
                case "data": {
                    assert.ok(!gotEnder, "Data after end event");
                    assert.ok(!gotData, "Too many data events");
                    coll.assertEvent(i, pipe.reader, "data", [buf]);
                    gotData = true;
                    break;
                }
            }
        }

        assert.ok(gotData, "No data event");
    }
}

/**
 * Test the reader encodings.
 */
function readerEncodings() {
    testWith(new Buffer("Stuff is stuff."), undefined);
    testWith(new Buffer("Stuff is not other stuff."), "base64");
    testWith(new Buffer("Stuff might be stuff."), "utf8");
    testWith(new Buffer("STUFF!!"), "ascii");

    function testWith(buf, enc) {
        var pipe = new Pipe();
        var coll = new EventCollector();

        coll.listenAllCommon(pipe.reader);
        coll.listenAllCommon(pipe.writer);

        pipe.reader.setEncoding(enc);
        pipe.writer.end(buf);

        var evs = coll.events;
        var expect = enc ? buf.toString(enc) : buf;

        for (var i = 0; i < evs.length; i++) {
            if (evs[i].name !== "data") {
                continue;
            }

            coll.assertEvent(i, pipe.reader, "data", [expect]);
        }
    }
}

/**
 * Test that there are no more reader events after the reader is
 * destroyed.
 */
function noEventsAfterReaderDestroyed() {
    var pipe = new Pipe();
    var coll = new EventCollector();

    coll.listenAllCommon(pipe.reader);
    coll.listenAllCommon(pipe.writer);

    pipe.writer.write("blort");
    assert.equal(coll.events.length, 1);
    assert.equal(coll.events[0].name, "data");
    coll.reset();

    pipe.reader.destroy();
    pipe.writer.write("blorty");
    pipe.writer.end();

    assert.equal(coll.events.length, 1);
    coll.assertEvent(0, pipe.writer, "close");
}

/**
 * Test that `readable` is true until the last data event is emitted.
 */
function readableTransition() {
    // First, the simple case.

    var pipe = new Pipe();
    assert.ok(pipe.reader.readable);
    pipe.writer.end();
    assert.ok(!pipe.reader.readable);

    // Less simple: Emit a single data event while paused, close the
    // writer, and ensure the reader is still readable before the
    // resume() happens.

    pipe = new Pipe(true);
    pipe.writer.end("blort");
    assert.ok(pipe.reader.readable);
    pipe.reader.resume();
    assert.ok(!pipe.reader.readable);
}

/**
 * Test that `writable` is true until the write end is closed.
 */
function writableTransition() {
    var pipe = new Pipe();

    assert.ok(pipe.writer.writable);

    // Closing the reader side shouldn't matter.
    pipe.reader.destroy();
    assert.ok(pipe.writer.writable);

    // But closing the writer side should.
    pipe.writer.end();
    assert.ok(!pipe.writer.writable);
}

function test() {
    constructor();
    noWrite();
    noWritePaused();
    emptyWrite();
    oneWrite();
    readerEncodings();
    noEventsAfterReaderDestroyed();
    readableTransition();
    writableTransition();
    // FIXME: More stuff goes here.
}

module.exports = {
    test: test
};
