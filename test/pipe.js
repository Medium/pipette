// Copyright 2012 The Obvious Corporation.

var assert = require("assert");
var events = require("events");
var stream = require("stream");

var Pipe = require("../").Pipe;

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
}

function test() {
    constructor();
    // FIXME: More stuff goes here.
}

module.exports = {
    test: test
};
