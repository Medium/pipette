// Copyright 2012 The Obvious Corporation.

/*
 * Simple read()-callback collector (for testing).
 */

/*
 * Modules used
 */

"use strict";

var assert = require("assert");
var typ = require("typ");


/*
 * Exported bindings
 */

function CallbackCollector() {
  this.callbacks = [];
  this.callback = this.callback.bind(this);
}

CallbackCollector.prototype.reset = function reset() {
  this.callbacks.length = 0;
}

CallbackCollector.prototype.callback =
function listen(error, length, buffer, offset) {
  this.callbacks.push({
    error: error,
    length: length,
    buffer: buffer,
    offset: offset
  });
}

CallbackCollector.prototype.assertCallback =
function assertEvent(index, error, length, buffer, offset) {
  var item = this.callbacks[index];

  assert.ok(item);
  assert.equal(item.error, error);
  assert.equal(item.length, length);

  if (buffer) {
    typ.assertBuffer(item.buffer);
    assert.strictEqual(buffer.toString("hex"), item.buffer.toString("hex"));
  } else {
    assert.ok(!item.buffer);
  }

  assert.equal(item.offset, offset);
}

module.exports = {
  CallbackCollector: CallbackCollector
};
