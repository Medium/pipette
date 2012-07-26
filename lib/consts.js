// Copyright 2012 The Obvious Corporation.

/*
 * Common constants used within this module
 */


/*
 * Exported bindings
 */

/**
 * Special error value indicating that there was in fact no error. This
 * is used instead of `undefined` to disambiguate the no-error case from
 * the case of an error receieved but with an `undefined` payload.
 *
 * The deal is that because we know no other code can legitimately
 * reach into this module to retrieve this value, we can use a `===`
 * comparison to this value to make the error / no-error
 * determination.
 */
var NO_ERROR = [ "no-error" ];
Object.freeze(NO_ERROR);

module.exports = {
  // event names
  CLOSE: "close",
  DATA: "data",
  DRAIN: "drain",
  END: "end",
  ERROR: "error", // also used as an ifPartial value
  PIPE: "pipe",

  // encoding names
  ASCII: "ascii",
  BASE64: "base64",
  UCS2: "ucs2",
  HEX: "hex",
  UTF16LE: "utf16le",
  UTF8: "utf8",

  // ifPartial option values
  EMIT: "emit",
  IGNORE: "ignore",
  PAD: "pad",

  // other
  NO_ERROR: NO_ERROR
};
