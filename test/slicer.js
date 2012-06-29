// Copyright 2012 The Obvious Corporation.

/*
 * Modules used
 */

"use strict";

var assert = require("assert");
var events = require("events");

var Slicer = require("../").Slicer;


/*
 * Tests
 */

/**
 * Make sure the constructor doesn't fail off the bat.
 */
function constructor() {
  new Slicer(new events.EventEmitter());
  new Slicer(new events.EventEmitter(), "hex");
}

/**
 * Test expected constructor failures.
 */
function constructorFailures() {
  function f1() {
    new Slicer();
  }
  assert.throws(f1, /Missing source/);

  function f2() {
    new Slicer("non-emitter");
  }
  assert.throws(f2, /Source not an EventEmitter/);

  function f3() {
    new Slicer(new events.EventEmitter(), "bad-encoding");
  }
  assert.throws(f3, /Invalid encoding name/);
}


function test() {
  constructor();
  constructorFailures();
}

module.exports = {
  test: test
};
