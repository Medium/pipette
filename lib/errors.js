// Copyright 2012 The Obvious Corporation.

/*
 * Utilities for error events
 */

/*
 * Modules used
 */

"use strict";


/*
 * Exported bindings
 */

/**
 * Gets whether the given value should be considered an "error". This
 * is used when looking at the payload of `close` events.
 *
 * In particular, to indicate that a stream was closed unexpectedly:
 *
 * * Some streams use a boolean value of `true`. Main culprit: `net.Socket`.
 * * Some streams use arbitrary objects, typically `Error` instances.
 *   Main culprit: `http.ClientResponse`.
 *
 * This function merely says that anything that is neither `false`
 * nor `undefined` is "errorish".
 */
function isErrorish(value) {
  return (value !== false) && (value !== undefined);
}

module.exports = {
  isErrorish: isErrorish
};
