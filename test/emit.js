// Copyright 2012 The Obvious Corporation.

/*
 * Modules used
 */

"use strict";


/*
 * Exported bindings
 */

/**
 * Emit an event with an optional argument.
 */
function emit(target, name, arg) {
  if (arg !== undefined) {
    target.emit(name, arg);
  } else {
    target.emit(name);
  }
}

module.exports = {
  emit: emit
};
