// Copyright 2012 The Obvious Corporation.

/*
 * A simple stream reader valve, for reliably capturing stream events
 * across tick boundaries.
 */


/*
 * Modules used
 */

"use strict";

var stream = require("stream");
var _      = require("underscore");


/*
 * Module variables
 */

/** event name */
var CLOSE = "close";

/** event name */
var DATA = "data";

/** event name */
var DRAIN = "drain";

/** event name */
var END = "end";

/** event name */
var ERROR = "error";


/*
 * Exported bindings
 */

/**
 * Create a data valve for the given data/end/error event source. This is
 * an instance of `Stream`.
 *
 * An instance starts out in the "off" position, buffering up
 * events. As soon as it is turned "on", it immediately emits the
 * buffered events (in order), and then passes through further events
 * as they are received.
 */
function create(source) {
    var self;
    var buffering = true;
    var buffer = []; // list of events

    source.on(DATA, onData);
    source.on(END, onEnd);
    source.on(ERROR, onError);

    function onData(data) {
        if (buffering) {
            buffer.push({ func: onData, arg: data });
        } else {
            self.emit(DATA, data);
        }
    }

    function onEnd() {
        if (buffering) {
            buffer.push({ func: onEnd });
        } else {
            self.emit(END);
        }
    }

    function onError(error) {
        if (buffering) {
            buffer.push({ func: onError, arg: error });
        } else {
            self.emit(ERROR, error);
        }
    }

    /**
     * Turn on the event flow.
     */
    function turnOn() {
        if (!buffering) {
            return;
        }

        buffering = false;
        for (var i = 0; i < buffer.length; i++) {
            var one = buffer[i];
            one.func(one.arg);
        }
    }

    self = new stream.Stream();
    self.turnOn = turnOn;

    return self;
}

module.exports = {
    create: create
};
