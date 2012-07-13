// Copyright 2012 The Obvious Corporation.

/*
 * Simple event collector (for testing).
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

function EventCollector() {
  this.events = [];
}

EventCollector.prototype.reset = function reset() {
  this.events.length = 0;
}

EventCollector.prototype.listen = function listen(target, name) {
  var events = this.events;

  target.on(name, add);

  function add(/*args*/) {
    events.push({
      target: target,
      name: name,
      args: [].slice.call(arguments, 0)
    });
  }
}

EventCollector.prototype.listenAllCommon = function listenAllCommon(target) {
  this.listen(target, "close");
  this.listen(target, "data");
  this.listen(target, "drain");
  this.listen(target, "end");
  this.listen(target, "error");
  this.listen(target, "pipe");
};

EventCollector.prototype.assertEvent =
function assertEvent(index, target, name, args) {
  if (args === undefined) {
    args = [];
  }

  var item = this.events[index];

  assert.ok(item);
  assert.strictEqual(item.target, target);
  assert.strictEqual(item.name, name);
  assert.strictEqual(item.args.length, args.length);

  for (var i = 0; i < args.length; i++) {
    var one = item.args[i];
    var other = args[i];
    if (one === other) {
      continue;
    }
    if (typ.isBuffer(one)) {
      typ.assertBuffer(other);
      assert.strictEqual(one.toString("hex"), other.toString("hex"));
    } else if (typ.isError(one)) {
      typ.assertError(other);
      assert.equal(one.message, other.message);
    } else {
      assert.strictEqual(one, other);
    }
  }
};

module.exports = {
  EventCollector: EventCollector
};
