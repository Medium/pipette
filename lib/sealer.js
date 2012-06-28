// Copyright 2012 The Obvious Corporation.

/*
 * Sealing / unsealing (object safety)
 */


/*
 * Modules used
 */

"use strict";


/*
 * Module variables
 */

/** the unsealer key */
var KEY = [ "pipette key" ];


/*
 * Exported bindings
 */

/**
 * Seal the given state.
 */
function seal(state) {
  return unseal;

  function unseal(key) {
    if (key === KEY) {
      return state;
    }
    throw new Error("Wrong key");
  }
}

/**
 * Unseal the given state.
 */
function unseal(sealedState) {
  return sealedState(KEY);
}

module.exports = {
  seal: seal,
  unseal: unseal
};
