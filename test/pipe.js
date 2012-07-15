// Copyright 2012 The Obvious Corporation.

/*
 * Modules used
 */

"use strict";

var assert = require("assert");
var events = require("events");
var stream = require("stream");
var typ = require("typ");

var Pipe = require("../").Pipe;

var EventCollector = require("./eventcoll").EventCollector;


/*
 * Tests
 */

/**
 * Makes sure the constructor doesn't blow up, and that the result
 * provides the expected members.
 */
function constructor() {
  var pipe = new Pipe();

  assert.ok(pipe.reader);
  assert.ok(pipe.writer);
  assert.ok(pipe.reader instanceof stream.Stream);
  assert.ok(pipe.writer instanceof events.EventEmitter);

  // Make sure sane options are passed.
  new Pipe({});
  new Pipe({ encoding: "ascii" });
  new Pipe({ paused: true });
  new Pipe({ paused: false });
}

/**
 * Tests expected constructor failures.
 */
function constructorFailure() {
  function f1() {
    new Pipe({ encoding: 12 });
  }
  assert.throws(f1, /Bad value for option: encoding/);

  function f2() {
    new Pipe({ paused: "true" });
  }
  assert.throws(f2, /Bad value for option: paused/);

  function f3() {
    new Pipe({ zamboni: 10 });
  }
  assert.throws(f3, /Unknown option: zamboni/);
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
    var pipe = new Pipe();
    var coll = new EventCollector();

    coll.listenAllCommon(pipe.reader);
    coll.listenAllCommon(pipe.writer);
    pipe.reader.pause();

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
    var buf = typ.isString(val) ? new Buffer(val, enc) : val;

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
  testWith(new Buffer("STUFF!!"), "ascii");
  testWith(new Buffer("Stuff is not other stuff."), "base64");
  testWith(new Buffer("stuffiness"), "hex");
  testWith(new Buffer("Gotta have stuff."), "ucs2");
  testWith(new Buffer("Stuff might be stuff."), "utf16le", "ucs2");
  testWith(new Buffer("Is it stuff yet?"), "utf8");

  function testWith(buf, enc, expectEnc) {
    expectEnc = expectEnc || enc; // See codec.setEncoding() implementation.

    var pipe = new Pipe();
    var coll = new EventCollector();

    coll.listenAllCommon(pipe.reader);
    coll.listenAllCommon(pipe.writer);

    pipe.reader.setEncoding(enc);
    pipe.writer.end(buf);

    var evs = coll.events;
    var expect = enc ? buf.toString(expectEnc) : buf;

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

  pipe = new Pipe();
  pipe.reader.pause();
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

/**
 * Test that a series of data events come through in the expected
 * order, both with and without an intermediate pause.
 */
function dataInOrder() {
  for (var i = 10; i < 101; i += 10) {
    withData(i);
    withData(i, i / 2);
  }

  function withData(count, pauseAt) {
    pauseAt = pauseAt || 0;

    var pipe = new Pipe();
    var coll = new EventCollector();

    coll.listenAllCommon(pipe.reader);
    coll.listenAllCommon(pipe.writer);

    for (var i = 0; i < count; i++) {
      if (pauseAt && (i === pauseAt)) {
        pipe.reader.pause();
      }
      pipe.writer.write(bufFor(i));
    }

    var expectDrain = false;

    if (pauseAt) {
      assert.equal(coll.events.length, pauseAt);
      for (var i = 0; i < pauseAt; i++) {
        coll.assertEvent(i, pipe.reader, "data", [bufFor(i)]);
      }
      coll.reset();
      pipe.reader.resume();
      expectDrain = true;
    }

    var dataEventCount = count - pauseAt;
    assert.equal(coll.events.length,
           dataEventCount + (expectDrain ? 1 : 0));

    for (var i = 0; i < dataEventCount; i++) {
      coll.assertEvent(i, pipe.reader, "data", [bufFor(pauseAt + i)]);
    }

    if (expectDrain) {
      coll.assertEvent(dataEventCount, pipe.writer, "drain");
    }
  }

  function bufFor(num) {
    return new Buffer("" + num);
  }
}

/**
 * Test a sequence of write, pause, write, resume, write, end.
 */
function drainThenData() {
  var pipe = new Pipe();
  var coll = new EventCollector();

  coll.listenAllCommon(pipe.reader);
  coll.listenAllCommon(pipe.writer);

  pipe.reader.setEncoding("ascii");

  pipe.writer.write("zorch");
  pipe.reader.pause();
  assert.equal(coll.events.length, 1);
  coll.assertEvent(0, pipe.reader, "data", ["zorch"]);
  coll.reset();

  pipe.writer.write("splat");
  assert.equal(coll.events.length, 0);

  pipe.reader.resume();
  assert.equal(coll.events.length, 2);
  coll.assertEvent(0, pipe.reader, "data", ["splat"]);
  coll.assertEvent(1, pipe.writer, "drain");
  coll.reset();

  pipe.writer.write("fizz");
  assert.equal(coll.events.length, 1);
  coll.assertEvent(0, pipe.reader, "data", ["fizz"]);
  coll.reset();

  pipe.writer.end();
  coll.assertEvent(0, pipe.reader, "end");
  coll.assertEvent(1, pipe.reader, "close");
  coll.assertEvent(2, pipe.writer, "close");
}

/**
 * Test that `write()` calls after the write side has been closed
 * is an error and causes no events to be emitted.
 */
function writeAfterEnd() {
  var pipe = new Pipe();
  var coll = new EventCollector();

  coll.listenAllCommon(pipe.reader);
  coll.listenAllCommon(pipe.writer);

  pipe.writer.end();
  assert.equal(coll.events.length, 3);
  coll.reset();

  function f1() {
    pipe.writer.write("testing");
  }
  assert.throws(f1, /Closed/);

  function f2() {
    pipe.writer.end("testing");
  }
  assert.throws(f2, /Closed/);

  assert.equal(coll.events.length, 0);
}

/**
 * Test that `pause()` and `resume()` calls throw errors after the
 * reader side has been ended.
 */
function pauseResumeAfterEnd() {
  var pipe = new Pipe();
  var coll = new EventCollector();

  coll.listenAllCommon(pipe.reader);
  coll.listenAllCommon(pipe.writer);

  pipe.writer.end();
  assert.equal(coll.events.length, 3);
  coll.reset();

  function f1() {
    pipe.reader.pause();
  }
  assert.throws(f1, /Closed/);

  function f2() {
    pipe.reader.resume();
  }
  assert.throws(f2, /Closed/);
}

/**
 * Tests the common constructor options.
 */
function commonOptions() {
  var theData = new Buffer("muffinberry scone");
  var pipe = new Pipe({ encoding: "hex", 
                        paused: true });
  var coll = new EventCollector();

  var reader = pipe.reader;
  coll.listenAllCommon(reader);
  
  pipe.writer.write(theData);
  pipe.writer.end();

  assert.ok(reader.readable);
  assert.equal(coll.events.length, 0);

  reader.resume();
  assert.ok(!reader.readable);
  assert.equal(coll.events.length, 3);
  coll.assertEvent(0, reader, "data", [theData.toString("hex")]);
  coll.assertEvent(1, reader, "end");
  coll.assertEvent(2, reader, "close");
}

function test() {
  constructor();
  constructorFailure();
  noWrite();
  noWritePaused();
  emptyWrite();
  oneWrite();
  readerEncodings();
  noEventsAfterReaderDestroyed();
  readableTransition();
  writableTransition();
  dataInOrder();
  drainThenData();
  writeAfterEnd();
  pauseResumeAfterEnd();
  commonOptions();
}

module.exports = {
  test: test
};
