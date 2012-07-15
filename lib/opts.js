// Copyright 2012 The Obvious Corporation.

/*
 * Validation and defaulting of options
 */


/*
 * Modules used
 */

"use strict";

var typ = require("typ");

var codec = require("./codec");
var consts = require("./consts");


/*
 * Module variables
 */

/**
 * Map from each option name to validation predicate and default
 * value
 */
var ALL_OPTIONS = {
  allowMultiple: { test: typ.isBoolean, def: false },
  encoding: { test: codec.isValidName, def: undefined },
  incomingEncoding: { test: codec.isValidName, def: undefined },
  paused: { test: typ.isBoolean, def: false },
  size: { test: isSize, def: 1 },
  ifPartial: { test: isIfPartial, def: consts.EMIT }
};


/*
 * Helper functions
 */

/**
 * Returns whether the value is a valid block size (positive
 * integer).
 */
function isSize(value) {
  return typ.isUInt(value) && (value > 0);
}

/**
 * Returns whether the value is a valid `ifPartial` option.
 */
function isIfPartial(value) {
  switch (value) {
    case consts.EMIT:
    case consts.ERROR:
    case consts.IGNORE:
    case consts.PAD: {
      return true;
    }
  }

  return false;
}


/*
 * Exported bindings
 */

/**
 * Returns a validated / defaulted copy of the given options (which
 * may be `undefined`). The only options allowed are the ones in the
 * given `allowed` map, (which map to an override mapping or `{}` for
 * no overrides).
 *
 * This returns a safe (private) copy of the options on success, or
 * throws on error.
 */
function validate(options, allowed) {
  if (typ.isDefined(options)) {
    typ.assertObject(options);
  } else {
    options = {};
  }

  var result = {};

  // Set up defaults.
  var allowedNames = Object.getOwnPropertyNames(allowed);
  for (var i = 0; i < allowedNames.length; i++) {
    var name = allowedNames[i];
    var info = ALL_OPTIONS[name];
    var override = allowed[name];
    result[name] = (override.def || info.def);
  }

  // Fill in options.
  var optionNames = Object.getOwnPropertyNames(options);
  for (var i = 0; i < optionNames.length; i++) {
    var name = optionNames[i];
    var value = options[name];
    var override = allowed[name];
    var info = ALL_OPTIONS[name];

    if (!override || !info) {
      throw new Error("Unknown option: " + name);
    }

    var test = override.test || info.test;

    if (!test(value)) {
      throw new Error("Bad value for option: " + name);
    }

    result[name] = value;
  }

  return result;
}

/**
 * Handles the three common options `encoding`, `incomingEncoding`, and
 * `paused`.
 */
function handleCommon(options, target, constructedPaused) {
  if (options.encoding) {
    target.setEncoding(options.encoding);
  }

  if (options.incomingEncoding) {
    target.setIncomingEncoding(options.incomingEncoding);
  }

  if (typ.isDefined(options.paused)) {
    if (options.paused) {
      if (!constructedPaused) {
        target.pause();
      }
    } else if (constructedPaused) {
      target.resume();
    }
  }
}

module.exports = {
  handleCommon: handleCommon,
  validate: validate
};
