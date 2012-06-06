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

var consts = require("./consts");


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

    source.on(consts.CLOSE, onClose);
    source.on(consts.DATA, onData);
    source.on(consts.END, onEnd);
    source.on(consts.ERROR, onError);

    function onClose() {
        if (buffering) {
            buffer.push({ func: onClose });
        } else {
            self.emit(consts.CLOSE);
        }
    }

    function onData(data) {
        if (buffering) {
            buffer.push({ func: onData, arg: data });
        } else {
            self.emit(consts.DATA, data);
        }
    }

    function onEnd() {
        if (buffering) {
            buffer.push({ func: onEnd });
        } else {
            self.emit(consts.END);
        }
    }

    function onError(error) {
        if (buffering) {
            buffer.push({ func: onError, arg: error });
        } else {
            self.emit(consts.ERROR, error);
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
