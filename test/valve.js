// Copyright 2012 The Obvious Corporation.

/*
 * Modules used
 */

"use strict";

var assert = require("assert");
var events = require("events");

var Valve = require("../").Valve;


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

function test() {
    constructor();
    needSource();
    // FIXME: More stuff goes here.
}

module.exports = {
    test: test
};
