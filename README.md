pipette: Pipe-like utilities for Node
=====================================

This Node module provides a couple utility classes that offer
pipe-like functionality.

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
    }
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

Pipe
----

### var pipe = new Pipe([paused])

Construct and return a new pipe pair. The result is an object with
mappings for `{ reader, writer }` for the two ends of the pipe.

If the optional `paused` argument is specified, it indicates whether
or not the reader side should start out in the paused state. It defaults
to `false`.

The reader and writer side each implement the standard Node stream
protocol for readable and writable streams (respectively).

The specified protocol allows writers to ignore the `fd` argument
to `stream.write()`, and this implementation in fact ignores it.


Valve
-----

### var valve = new Valve(source, [paused])

Construct and return a new valve, which listens to the given source.

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


