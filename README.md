pipette: Pipe-like utilities for Node
=====================================

This Node module provides several utility classes that offer
pipe and stream-related functionality.

Two of these classes (`Cat` and `Valve`) provide a layer on top of
other streams. The implementation philosophy is that these listen
for events from their "upstream" streams, but they do not otherwise
attempt to interact with those streams. For example, they do not pass
through the flow-control methods `pause()` and `resume()`, nor do they
respond to `destroy()` by trying to destroy the underlying stream(s).

### Blip

The `Blip` class exists to emit a single `data` event using the standard
Node readable stream protocol.

This class is useful if you have data that you need to re-emit.

### Cat

The `Cat` class (short for "concatenate" and by analogy with the
traditional Unix command with the same name) emits the events from
a sequence of streams, in the order of the given sequence (i.e.
not interspersed).

This can be used, for example, to produce a stream that is prefixed
or suffixed with a given bit of data (when used in combination with
`Blip`, above).

### Pipe

The `Pipe` class is a simple in-memory pipe, which provides writer and
reader ends, which both obey the standard Node stream protocols, including
event emission, encoding handling, and pause/resume semantics.

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

### Sink

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

### Valve

The `Valve` class is a bufferer of readable stream events, which in turn
provides the standard Node readable stream protocol, including event
emission and pause/resume semantics. (It doesn't do any data re-encoding,
though; it's just a pass-through on that front.)

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
    var valve = new Valve(request);

    process.nextTick(function () {
        thingThatWantsToRead.startReading(valve);
    });
}
```


Building and Installing
-----------------------

```shell
npm install pipette
```

Or grab the source. As of this writing, this module has no
dependencies, so once you have the source, there's nothing more to do
to "build" it.


Testing
-------

```shell
npm test
```

Or

```shell
node ./test/test.js
```


API Details
-----------

Blip
----

### var blip = new Blip([data])

Constructs and returns a new blip which is to emit the given `data`
(a string or buffer) once unpaused. After emitting the `data` event,
blips always also emit an `end` and a `close` event (in that order).

If `data` is omitted, then the resulting blip will *just* emit the
ending events, without a `data` event first.

Blips always start out paused, since there is not much point in them
immediately emitting their contents upon construction.

The constructed instance obeys the full standard Node stream protocol
for readers, except that `setEncoding()` throws when called.


Cat
---

### var cat = new Cat(streams, [paused])

Constructs and returns a new cat which is to emit the events from
the given streams (each of which must be an `EventEmitter` and is
assumed to emit the standard Node readable stream events).

The data events from each stream (in order) are in turn emitted by
this instance, switching to the next stream when the current stream
emits either an `end` or `close` event. After all the streams have
been "consumed" in this fashion, this instance emits an `end` and then
a `close` event. If a stream should emit an `error` event, then that
event is in turn emitted by this instance, after which this instance
will become closed (emitting no further events, and producing `false`
for `cat.readable`).

If the optional `paused` argument is specified, it indicates whether
or not the new instance should start out in the paused state. It defaults
to `true`, because that's the overwhelmingly most common use case.

The constructed instance obeys the full standard Node stream protocol
for readers, except that `setEncoding()` throws when called. This
class provides only pass-through of data, not translation.

Also, this class does not attempt to do `pause()` or `resume()` on the
streams passed to it. Instead, it buffers events internally.


Pipe
----

### var pipe = new Pipe([paused])

Constructs and returns a new pipe pair. The result is an object with
mappings for `{ reader, writer }` for the two ends of the pipe.

If the optional `paused` argument is specified, it indicates whether
or not the reader side should start out in the paused state. It defaults
to `false`.

The reader and writer side each implement the standard Node stream
protocol for readable and writable streams (respectively).

The specified protocol allows writers to ignore the `fd` argument
to `stream.write()`, and this implementation in fact ignores it.


Sink
----

### var sink = new Sink(source)

Constructs and returns a new sink, which listens to the given source
stream. Once the stream has ended (via either an `end` or `close`
event), this instance emits a single `data` event containing all
of the data received from the source (if there was any data at all),
followed by an `end` and then a `close` event.

If the source should ever emit an `error` event, then this will cause
the sink instance to first emit any data it received (as a single
`data` event), followed by an `error` event that corresponds to the
one it received, after which it will emit no further events.

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

If the sink received and data but has no specified encoding, this
returns the straight buffer of data.

Note that this method can return a defined (not `undefined`) value
before the corresponding `data` event is emitted, particularly if the
sink happens to be paused at the time the upstream stream is ended.

Also note that there is a bit of ambiguity with this method, in terms of
differentiating a stream that got ended with no data ever received
with one that simply hasn't yet ended. Instead of using this method
for that purpose, use `sink.readable` (part of the standard readable
stream protocol).

### sink.getError() => object || undefined

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

The `name` must be one of the allowed encoding names for
`Stream.setEncoding()` (per the Node documentation for same).

The incoming encoding starts out as `undefined`, which is taken to
be synonymous with `"utf8"` should a `data` event be received
containing a string payload.


Valve
-----

### var valve = new Valve(source, [paused])

Constructs and returns a new valve, which listens to the given source.

If the optional `paused` argument is specified, it indicates whether
or not the new instance should start out in the paused state. It defaults
to `true`, because that's the overwhelmingly most common use case.

The constructed instance obeys the full standard Node stream protocol
for readers, except that `setEncoding()` throws when called. This
class provides only pass-through of data, not translation.


To Do
-----

* Come up with something to do.


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


License
-------

Copyright 2012 [The Obvious Corporation](http://obvious.com/).

Licensed under the Apache License, Version 2.0. 
See the top-level file `LICENSE.txt` and
(http://www.apache.org/licenses/LICENSE-2.0).


