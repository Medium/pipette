pipette: Stream and pipe utilities for Node
===========================================

This Node module provides several utility classes that offer
pipe and stream-related functionality. It particularly emphasizes
providing a consistent event packaging and ordering for streams.


Building and Installing
-----------------------

```shell
npm install pipette
```

Or grab the source and

```shell
npm install
```


Testing
-------

```shell
npm test
```

Or

```shell
node ./test/test.js
```


Event Sequence Philosophy
-------------------------

All of the classes in this module provide a consistently ordered
sequence of events, which is meant to be a sensible synthesis of the
(somewhat inconsistent) Node specification for the various core
stream classes.

In particular, a stream will emit some number of `data` events
(possibly zero), each with a single payload argument. This will be
followed by *either* an `end` event with no payload or an `error`
event with an arbitrary payload. This is followed by a `close` event
with no payload. After that, a stream will not emit any further
events, and it is furthermore guaranteed to be detached from its
upstream source(s), if any.

More schematically, as a "railroad" diagram:

```
        +--------------------+      +-------+
        |                    |   +->| end() |----------+
        v  +---------------+ |   |  +-------+          |  +---------+
(start)-+->| data(payload) |-+-+-+                     +->| close() |->(finish)
        |  +---------------+   ^ |  +----------------+ |  +---------+
        |                      | +->| error(payload) |-+
        +----------------------+    +----------------+
```

Of particular note are the cases of inconsistently-defined `close`
events. Some streams (core Node stream classes, for example) will emit
a `close` event with a non-empty payload value to indicate an
unexpected termination. The classes in this module consistently
translate such cases to an `error` event with the error payload
followed by a no-payload `close` event. For the purposes of this
module, a "non-empty payload" is one that is neither `undefined` nor
`false`. This takes care of the quirky definitions of `net.Socket`
(which includes a boolean error indicator in its `close` event) and
`http.ClientResponse` (which may include an arbitrary error object in
its `close` event).

The particularly nice thing about this arrangement is that if one
wants to consistently do something after a stream has finished, one
can write the something in question as a `close` event handler, rather
than splaying the logic between both an `end` and an `error` handler.

In the rest of the documentation, it should be taken as implicit that
all the classes' event sequences follow this order.


Layering Philosophy
-------------------

Four of these classes (`Cat`, `Sink`, `Slicer`, and `Valve`) provide a
layer on top of other streams. The implementation philosophy is that
these listen for events from their "upstream" sources, but they do not
otherwise attempt to interact with those streams. In particular:

* They do not make upstream calls to the flow-control methods
  `pause()` and `resume()`.

* They do not attempt to make upstream `setEncoding()` calls.

* They do not call upstream `destroy()` even when they themselves are
  being `destroy()`ed.

In addition, these layering classes check upon construction that their
upstream sources are in fact streams that have not yet been ended
(that is, that they are still capable of emitting events). If a stream
source argument fails this check, then the constructor call will throw
an exception indicating that fact. The check is somewhat conservative
(on the side of accepting) and meant to accept stream-like event
emitters in addition to checking bona fide `Stream` instances.
Details: If a given source is a `Stream` per se, then the value of
`source.readable` is taken at face value. Otherwise, a source is
considered to be ended if and only if it (or a prototype in its chain)
defines a `readable` property and that property's value is falsey.

### Constructing stacked readers

Many Node stream classes are designed as an atomic unit that includes
both reader and writer methods intermingled in a single object. This
module takes a different tack:

* Any given object is either a reader or a writer, never both.

* To pass one reader's event output to another, construct the destination
  object passing it the source, e.g. `new Valve(new OtherStream(...))`.

### Getting a writer

If you need to get a writer to write into one of the reader classes
(or a stack of same), you can use a `Pipe`:

```javascript
var pipe = new Pipe();
var readerStack = new OtherStream(pipe.reader);
var writer = pipe.writer;

writer.write(...); // What's written here will get read by the OtherStream.
```


A Note About Encodings
----------------------

Node 0.6.* and 0.8.* differ in their documentation about which encodings
are allowed by `setEncoding()`. This module accepts the union of the
encodings specified by those. This includes:

* `ascii` &mdash; 7-bit ASCII
* `base64` &mdash; standard Base-64 encoding for binary data
* `hex` &mdash; hex encoding for binary data (two hexadecimal ASCII
  characters per byte)
* `ucs2` &mdash; alias for `utf16le` (below). This is not technically correct
  (per Unicode spec), but it is how Node is defined.
* `utf16le` &mdash; standard little-endian UTF-16 encoding for Unicode data
* `utf8` &mdash; standard UTF-8 encoding for Unicode data


Common Options
--------------

All of the classes in this module take an optional `options`
constructor parameter. If not `undefined`, this must be a map from
option names to values as specified by the class.

The following are three commonly-accepted options. Classes all accept
whichever of these make sense.

* `encoding` &mdash; A string representing the encoding to use when
  emitting events. Passing this option is exactly like calling
  `setEncoding()` on the constructed instance.

* `incomingEncoding` &mdash; A string representing the incoming
  encoding to use when interpreting incoming `data` events that arrive
  as strings (as opposed to buffers). Passing this option is exactly
  like calling `setIncomingEncoding()` on the constructed instance.

* `paused` &mdash; A boolean value indicating whether the instance
  should be immediately paused. For most classes, this is exactly like
  calling `pause()` on the constructed instance.


* * * * * * * * * *

API Details
===========

Blip
----

The `Blip` class exists to emit a single `data` event.

This class is useful if you have data that you need to re-emit.

### var blip = new Blip([data], [options])

Constructs and returns a new blip which is to emit the given `data`
(a string or buffer) once unpaused. After emitting the `data` event,
blips always also emit an `end` and a `close` event (in that order).

Of the common options, Blip recognizes `encoding` and
`incomingEncoding`, though the latter is with a twist: The
`incomingEncoding` (either as specified or with the default behavior)
applies immediately to the given `data`, in order to transform it into
a buffer. That is, if `data` is passed as a string, it will always get
immediately transformed into a buffer, when an instance is
constructed.

If `data` is omitted, then the resulting blip will *just* emit the
ending events, without a `data` event first.

Blips start out paused, since there is not much point in them
immediately emitting their contents upon construction (as there
will necessarily be no listeners at that moment).

The constructed instance obeys the full standard Node stream protocol
for readers.


Cat
---

The `Cat` class (short for "concatenate" and by analogy with the
traditional Unix command with the same name) emits the events from
a sequence of streams, in the order of the given sequence (i.e.
not interspersed).

This can be used, for example, to produce a stream that is prefixed
or suffixed with a given bit of data (when used in combination with
`Blip`, above).

### var cat = new Cat(streams, [options])

Constructs and returns a new cat which is to emit the events from
the given streams (each of which must be an `EventEmitter` and is
assumed to emit the standard Node readable stream events).

The data events from each stream (in order) are in turn emitted by
this instance, switching to the next stream when the current stream
emits either an `end` or `close` event. After all the streams have
been "consumed" in this fashion, this instance emits an `end` and then
a `close` event.

If a stream should emit an `error` event, then that event is in turn
emitted by this instance, after which this instance emits a `close`
event. It will then become closed (emitting no further events, and
producing `false` for `cat.readable`).

This class recognizes all three of the common options (see above), and
no others.

The constructed instance obeys the full standard Node stream protocol
for readers.

### cat.setIncomingEncoding(name)

Sets the incoming encoding of the stream. This is the encoding to use
when interpreting strings that arrive in `data` events. (This is as
opposed to the encoding set by `setEncoding()` which determines how
the collected data is transformed as it gets emitted from an
instance.)

The `name` must be one of the unified allowed encoding names for
`Stream.setEncoding()`.

The incoming encoding starts out as `undefined`, which is taken to
be synonymous with `"utf8"` should a `data` event be received
containing a string payload.


Dropper
-------

The `Dropper` class is a bufferer of readable stream events, which
relays those events in fixed size blocks (or multiples thereof),
a.k.a. "drops" (hence the name). It handles pause/resume semantics,
and it will always translate incoming values that aren't buffers into
buffers, using a specified and settable incoming encoding.

The only exception to the block size is that the last `data` event
from a Dropper may have a smaller size, if the last data it received
(before an `end` or `error`) would not end up filling up a block of
the specified size. In this case, the behavior is specified by
the `ifPartial` option (see below).

Other than the fixed-size block part, the semantics of this class are
basically the same as the simpler `Valve` class (see below).

### var dropper = new Dropper(source, [options])

Constructs and returns a new dropper, which listens to the given source.
This takes an optional `options` argument, which if present must be
a map of options, including any of the common options (see above)
as well as any of the following:

* `size` &mdash; block (aka drop) size in bytes. Must be a positive
  integer. Defaults to `1`.

* `allowMultiple` &mdash; whether emitted data events are to be the
   exact block size (`false`) or may be an even multiple of the block
   size (`true`). Must be a boolean. Defaults to `false`.

* `ifPartial` &mdash; what to do with a partial block at the
   end of the stream; one of `emit` (emit it as-is),
   `ignore` (drop it entirely), `pad` (zero-pad), `error` (emit
   an error). Defaults to `emit`.

The constructed instance obeys the full standard Node stream protocol
for readers.

(Note: As of this writing, this is the only one of the classes in this
module that takes an options object on construction. It is likely that
the rest of the classes will migrate to this form.)

### dropper.setIncomingEncoding(name)

Sets the incoming encoding of the stream. This is the encoding to use
when interpreting strings that arrive in `data` events. (This is as
opposed to the encoding set by `setEncoding()` which determines how
the collected data is transformed as it gets emitted from an
instance.)

The `name` must be one of the unified allowed encoding names for
`Stream.setEncoding()`.

The incoming encoding starts out as `undefined`, which is taken to
be synonymous with `"utf8"` should a `data` event be received
containing a string payload.


Pipe
----

The `Pipe` class is a simple in-memory pipe, which provides writer and
reader ends. Pipes handle data encoding and obey pause/resume semantics.

This class is useful if you have code that wants to call writable stream
style methods, and you want it to be directly attached to some other code
that expects to be listening for events. For example:

```javascript
var listeningThingy = ...;
var writingThingy = ...;

var pipe = new Pipe();
listeningThingy.listenTo(pipe.reader);
writingThingy.writeTo(pipe.writer);
```

### var pipe = new Pipe([options])

Constructs and returns a new pipe pair. The result is an object with
mappings for `{ reader, writer }` for the two ends of the pipe.

The reader and writer side each implement the standard Node stream
protocol for readable and writable streams (respectively).

The specified protocol allows writers to ignore the `fd` argument
to `stream.write()`, and this implementation in fact ignores it.

Of the common options, the constructor accepts `encoding` and `paused`,
which both apply to the reader end of the pipe.


Sink
----

The `Sink` class is an in-memory collector of all the data read from a
given stream. It is in turn itself a stream that emits no more than a
single `data` event consisting of all of the data it received, once
its upstream source has ended. It also has direct accessors method to
get at the data or a stream-ending error, to provide a bit of
flexibility in how the class is used.

This class is useful for cases where you don't care about incremental
processing and just want to deal with the whole enchilada (as it
were). This can be used to collect an entire post body from an HTTP
request, for example:

```javascript
var httpServer = http.createServer(onRequest);

function onRequest(request, response) {
  var postData = new Sink(request);
  postData.on("data", onPostData);

  function onPostData(data) {
    console.log("Got post:", data.toString());
  }
}
```

### var sink = new Sink(source, [options])

Constructs and returns a new sink, which listens to the given source
stream. Once the stream has ended (via either an `end` or `close`
event), this instance emits a single `data` event containing all
of the data received from the source (if there was any data at all),
followed by an `end` and then a `close` event.

If the source should ever emit an `error` event, then this will cause
the sink instance to first emit any data it received (as a single
`data` event), followed by an `error` event that corresponds to the
one it received, and finally followed by a `close` event. After that,
it will emit no further events.

This class recognizes all three of the common options (see above), and
no others.

The constructed instance obeys the full standard Node stream protocol
for readers.

In addition to being readable streams, sinks have a few more methods.

### sink.getData() => buffer || string || undefined

Gets the final complete data for the sink, if available.

If the sink's source has not yet ended, or if it ended without
ever emitting any data, this returns `undefined`.

If the sink received any data and has a specified encoding (via
`setEncoding()`), this returns the string form of the data, as decoded
using the named encoding.

If the sink received any data but has no specified encoding, this
returns the straight buffer of data.

Note that this method can return a defined (that is, not `undefined`)
value before the corresponding `data` event is emitted, particularly
if the sink happens to be paused at the time the upstream stream is
ended.

Also note that there is a bit of ambiguity with this method, in terms of
differentiating a stream that got ended with no data ever received
with one that simply hasn't yet ended. Instead of using this method
for that purpose, use `sink.readable` (part of the standard readable
stream protocol).

### sink.getError() => any

Gets the error that terminated the upstream source, if available.

If the sink's source has not yet ended, or if it ended normally, this
returns `undefined`.

If the sink's source ended with an `error` event, then this returns the
same value that was received in that error event.

Note that this method can return a defined (not `undefined`) value
before the corresponding `error` event is emitted, particularly if the
sink happens to be paused at the time the upstream stream reports its
error.

Also note that there is a bit of ambiguity in terms of interpreting a
stream that got ended with an `error` event whose payload is
`undefined`. If you need to account for this possibility, use
`sink.gotError()`.

### sink.gotError() => boolean

Gets whether or not the upstream source was ended with an error.

This returns `false` if the source has not yet ended, or if it ended
normally.

This returns `true` if and only if the upstream source emitted an
`error` event that this sink instance received.

Note that this method can return `true` before the corresponding
`error` event is emitted, particularly if the sink happens to be
paused at the time the upstream stream reports its error.

### sink.setIncomingEncoding(name)

Sets the incoming encoding of the stream. This is the encoding to use
when interpreting strings that arrive in `data` events. (This is as
opposed to the encoding set by `setEncoding()` which determines how
the collected data is transformed as it gets emitted from an
instance.)

The `name` must be one of the unified allowed encoding names for
`Stream.setEncoding()`.

The incoming encoding starts out as `undefined`, which is taken to
be synonymous with `"utf8"` should a `data` event be received
containing a string payload.


Slicer
------

The `Slicer` class (like `Sink`) is an in-memory bufferer of data
read from a given stream. In turn, it provides a `fs.read()` style
interface to get at the data so-read.

As the name implies, this class is useful for slicing up a stream
into chunks that aren't (necessarily) the same shape as the ones
that came in as `data` events.

Most of the "interesting" methods on the class take a callback
argument to receive data back from the instance. These are all
consistently called as `callback(error, length, buffer, offset)` with
no `this` and with arguments defined as follows:

* `error` &mdash; a boolean flag indicating whether the read was cut short
  due to an error *or* because there was insufficient data to fully
  comply with the request. (Note: This is different than `fs.read()`
  which passes an error object here. See `slicer.gotError()` below for
  an explanation of why.)

* `length` &mdash; the number of bytes read.

* `buffer` &mdash; the buffer that was read into.

* `offset` &mdash; the offset into `buffer` where the reading was done.

The ordering and meaning of the callback arguments are meant to be (a)
compatible with callbacks used with `fs.read()` and (b) somewhat more
informative and unambiguous.

### var slicer = new Slicer(source, [options])

Constructs a new slicer, which listens to the given source.

Of the common options, the only one recognized by this class is
`incomingEncoding`. The class accepts no other options.

This class recognizes all three of the common options (see above), and
no others.


### slicer.readable => boolean

This indicates whether there is any data left to be read in the stream
or whether there *could* be any day left to be read.

In particular, this only becomes `false` when it is both the case that
the buffer of pending data is empty *and* the upstream source has ended.

This field is meant to be reasonably analogous to the readable stream
field of the same name.

### slicer.destroy()

Causes the instance to be cleaned up and become closed. In particular,
it includes detaching from the upstream source. After this method is
called, other methods on this class will behave as if the upstream
source ended with no error.

This method is meant to be reasonably analogous to the readable stream
field of the same name.

### slicer.setIncomingEncoding(name)

Sets the incoming encoding of the source stream. This is the encoding
to use when interpreting strings that arrive in `data` events.

The `name` must be one of the unified allowed encoding names for
`Stream.setEncoding()`.

The incoming encoding starts out as `undefined`, which is taken to
be synonymous with `"utf8"` should a `data` event be received
containing a string payload.

### slicer.gotError() => boolean

Indicates whether the upstream source has indicated an error condition.
This is out-of-band with respect to the data, in that there may still
be data that can be successfully read even if this method returns `true`.

This method exists to help disambiguate the case of not
having gotten an error indicator from the case of having gotten an
error indicator but without any error instance payload.

### slicer.getError() => any

Gets the error payload that was reported from upstream, if any.
This is out-of-band with respect to the data, in that there may still
be data that can be successfully read even if this method returns a
defined value.

This will always return `undefined`, unless the upstream source
reported an error with a defined payload.

### slicer.readAll(callback)

Reads as much data as possible from the stream, blocking the callback
*only* in order to make it to the head of the read queue.

To be clear, if there is no data available in the slicer at the time
this read becomes potentially-serviced, then it will in fact get
serviced, with the callback indicating that zero bytes were read
without error.

The `buffer` in the callback will always be a freshly-allocated buffer
that does not share its data with any other instance.

### slicer.read(length, callback)

Reads exactly `length` bytes of data from the stream if at all
possible, blocking the callback until either `length` bytes are
available or the stream has ended (either normally or with an error).

If `length` is passed as `0` it means "read zero bytes". This can be
useful as a way to insert a no-data "sentinal" callback into the
sequence of callbacks coming from this instance.

To be clear, the callback will only ever indicate a shorter `length`
than requested if the upstream source ends without at least `length`
bytes being available. If a short read ends up happening, then the
callback will get passed `true` for the error flag.

The `buffer` in the callback will always be a freshly-allocated buffer
that does not share its data with any other instance.

### slicer.readInto(buffer, offset, length, callback)

Reads some amount of data from the stream into the indicated `buffer`
(which must be a `Buffer` instance), starting at the indicated
`offset` and reading exactly `length` bytes if at all possible.

If `offset` is passed as `undefined` it defaults to `0`.

If `length` is passed as `undefined` it means "read as much as
possible without blocking". This is different than passing `0` which
means simply "read zero bytes". (This latter case can actually be
useful. See `slicer.read(length, callback)` above.)

As with `read()`, the only time the length will be shorter than what
was requested will be if the stream ends without there being at least
`length` bytes to read. If a short read ends up happening, then the
callback will get passed `true` for the error flag.


Valve
-----

The `Valve` class is a bufferer of readable stream events, which
relays those events consistently. It handles pause/resume semantics,
and it will always translate incoming values that aren't buffers into
buffers, using a specified and settable incoming encoding.

One of the major use cases of this class is to use it to capture the
data coming from a network stream that's already in the middle of
producing data, particularly when you don't immediately know where
that data needs to go to. The author has run into this on multiple
occasions when trying hand off reading from an HTTP connection
across a tick boundary, along these lines for example (obviously
simplified here):

```javascript
var thingThatWantsToRead = {
  startReading: function (stream) {
    stream.on("data", ...);
    stream.resume();
    ...
  },
  ...
}

function httpRequestCallback(request, response) {
  var valve = new Valve(request, true);

  process.nextTick(function () {
    thingThatWantsToRead.startReading(valve);
  });
}
```

Another handy use for Valve is *just* to provide consistent data
payloads (always buffers, or always properly encoded strings) and the
consistent event ordering generally guaranteed by this module. In
particular on the event type front, the standard Node HTTP and HTTPS
streams are inconsistent with the core `Stream` in that they can emit
`close` events that contain either a boolean error flag or a full-on
`Error` instance. By layering a `Valve` on top of them, these get
translated into a consistent `error`-then-`close` sequence.

Similarly, if you want to implement a `Stream` as part of your own API
but don't want to deal with all the fiddly bits, you can write a
straightforward `EventEmitter`, and then expose it via a Valve, as in:

```javascript
function MyEventEmitter() {
  events.EventEmitter.call(this);
  ...
}

util.inherits(this, events.EventEmitter);

function createMyStream() {
  var coreEmitter = new MyEventEmitter();
  return new pipette.Valve(coreEmitter);
}
```

The Valve will "sanitize" the events coming from your class, while
also providing the rest of the core readable Stream API.

### var valve = new Valve(source, [options])

Constructs and returns a new valve, which listens to the given source.

This class recognizes all three of the common options (see above), and
no others.

The constructed instance obeys the full standard Node stream protocol
for readers.

### valve.setIncomingEncoding(name)

Sets the incoming encoding of the stream. This is the encoding to use
when interpreting strings that arrive in `data` events. (This is as
opposed to the encoding set by `setEncoding()` which determines how
the collected data is transformed as it gets emitted from an
instance.)

The `name` must be one of the unified allowed encoding names for
`Stream.setEncoding()`.

The incoming encoding starts out as `undefined`, which is taken to
be synonymous with `"utf8"` should a `data` event be received
containing a string payload.


* * * * * * * * * *

To Do
-----

* Consider adding a common option of `pressure: boolean` to indicate
  whether `pause()` and `resume()` should recurse upstream.


Contributing
------------

Questions, comments, bug reports, and pull requests are all welcome.
Submit them at [the project on GitHub](https://github.com/Obvious/pipette/).

Bug reports that include steps-to-reproduce (including code) are the
best. Even better, make them in the form of pull requests that update
the test suite. Thanks!


Author
------

[Dan Bornstein](https://github.com/danfuzz)
([personal website](http://www.milk.com/)), supported by
[The Obvious Corporation](http://obvious.com/).

Thanks to <https://github.com/rootslab/dropper> for the name of the
`Dropper` class.


License
-------

Copyright 2012 [The Obvious Corporation](http://obvious.com/).

Licensed under the Apache License, Version 2.0.
See the top-level file `LICENSE.txt` and
(http://www.apache.org/licenses/LICENSE-2.0).


