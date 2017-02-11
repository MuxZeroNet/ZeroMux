// The Byte Stream - converting indices to offsets

function newByteStream(jsonPath, sortedParts, events)
{
    var s = {};
    s["offsetList"] = _makeOffsetList(sortedParts);
    s["position"] = 0;

    s["_stopSignal"] = false;
    s.abort = function()
    {
        s["_stopSignal"] = true;
    };

    s.readFrom = function(offset, callback)
    {
        s.lock(function()
        {
            if(offset == "current")
            {
                offset = s.position;
            }
            _streamRead(s, offset, callback);
        });
        
    };
    s.read = function(callback)
    {
        s.readFrom("current", callback);
    };

    s.peakAt = function(offset)
    {
        return _streamPeak(s, offset);
    };

    // read lock
    s["_busyReading"] = false;
    s.markBusy = function()
    {
        s["_busyReading"] = true;
    };
    s.markFree = function()
    {
        s["_busyReading"] = false;
    };
    s.isBusy = function()
    {
        return s["_busyReading"];
    };
    s.lock = function(callback)
    {
        return _waitAndLock(s, callback);
    };

    // make buffer, range and daemon
    s["daemon"] = _makeDaemon(s, sortedParts.length);

    // make dl events and its connections to daemon
    s["events"] = _makeEvents(s, s.daemon, events);

    s["jsonPath"] = jsonPath;
    s["dlStarted"] = false;

    s.preload = function()
    {
        _startDl(s);
    };

    return s;
}

function _makeOffsetList(sortedParts)
{
    if(sortedParts == null || sortedParts.length == 0)
    {
        throw "Invalid file parts";
    }

    var offsetList = [0];
    var sizeSum = sortedParts[0].size;
    for(var i = 1; i < sortedParts.length; i++)
    {
        offsetList.push(sizeSum);
        sizeSum += sortedParts[i].size;
    }

    offsetList.push(sizeSum);

    return offsetList;
}

function _makeDaemon(self, length)
{
    // daemon buffer and range
    self["buffer"] = new Array(length);
    self["rangeStart"] = -1;
    self["rangeEnd"] = -1;

    // daemon fns
    var fns = initDaemonFns();

    fns.dataInput.getStopSignal = function()
    {
        return self["_stopSignal"];
    };
    fns.dataInput.getLoadedRange = function()
    {
        return [self.rangeStart, self.rangeEnd];
    };
    fns.dataInput.getBufferReference = function()
    {
        return self.buffer;
    };

    fns.callbacks.onStopped = function(reason)
    {
        self.markFree(); // release lock
    };

    return initDaemon(fns);
}

function _makeEvents(self, daemon, userEvents)
{
    // initialize the list of events
    var events = initEventObj();

    // triggers when file.json is loaded or failed to load
    events.onjsonload = userEvents.onjsonload;
    events.onjsonerror = userEvents.onjsonerror;

    // triggers when a file chunk is being added (being downloaded and verified),
    // added, or failed to add to the internal buffer
    events.onadding = userEvents.onadding;

    events.onadded = function(eventArgs)
    {
        var index = eventArgs["index"];
        var bytes = eventArgs["pieceBytes"];

        self.buffer[index] = bytes;
        self.rangeStart = daemon.getRangeStart();
        self.rangeEnd = lastInFirstSequence(self.buffer, self.rangeStart);

        console.log([self.rangeStart, self.rangeEnd]);
        for(var i = self.rangeStart; i < self.rangeEnd + 1; i++)
        {
            assert(self.buffer[i] != null);
        }

        userEvents.onadded(eventArgs);
    };

    events.onpieceerror = userEvents.onpieceerror;

    // triggers when the original big file is being build, built or failed to build.
    events.onblobbuilding = function(e)
    {
        // set everything as loaded
        self.rangeStart = 0;
        self.rangeEnd = self.buffer.length - 1;

        userEvents.onblobbuilding(null);
    };
    
    events.onfinish = userEvents.onfinish;
    events.onbuilderror = userEvents.onbuilderror;

    events.otherParams = userEvents.otherParams;

    events.suggest = function()
    {
        return daemon.getRangeStart();
    };

    return events;
}

// make sure `offset` is WITHIN the bounds of `list`
// when offset is not found, return the nearest lowerBound or upperBound
// returns index
function _offsetBinarySearch(list, offset, low=0, up=null, retLower=true)
{
    var lowerBound = low
    var upperBound = up || list.length - 1;

    if (list[lowerBound] == offset)
    {
        return lowerBound;
    }
    else if (list[upperBound] == offset)
    {
        return upperBound;
    }
    else if (lowerBound + 1 >= upperBound)
    {
        // not found
        return (retLower) ? lowerBound : upperBound;
    }

    var half = lowerBound + (upperBound - lowerBound) / 2;
    half = half | 0; /* "//" 2 */

    if (list[half] == offset)
    {
        return half;
    }

    else if (list[half] < offset)
    {
        // lower <- half
        return _offsetBinarySearch(list, offset, half, upperBound, retLower);
    }

    else if (list[half] > offset)
    {
        // upper <- half
        return _offsetBinarySearch(list, offset, lowerBound, half, retLower);
    }
}

function _waitAndLock(self, callback)
{
    setTimeout(function()
    {
        if(self.isBusy())
        {
            _waitAndLock(self, callback);
        }
        else
        {
            console.log("Locking...");

            self.markBusy();
            callback();
        }
    }, 37);
}

function _streamRead(self, offset, callback)
{
    self.preload(); // start downloading

    console.log("Read from offset " + offset);

    var chunkIndex = _getIndex(self.offsetList, offset);
    if(chunkIndex == self.offsetList.length - 1)
    {
        // EOF
        callback(offset, new ArrayBuffer());
    }

    var difference = offset - self.offsetList[chunkIndex];
    
    assert(difference >= 0, "diff < 0");

    var sliceAndCallback = function(bytes)
    {
        if(bytes == null) // read failed
        {
            // release lock
            self.markFree();

            console.warn("Byte stream: Read timed out");

            callback(offset, null);
        }
        else
        {
            // move pointer
            self.position = offset + bytes.byteLength - difference;
            // release lock
            self.markFree();

            if(difference == 0)
            {
                callback(offset, bytes);
            }
            else
            {
                callback(offset, bytes.slice(difference));
            }
        }
    };

    // first, peak
    var bytes = self.daemon.peak(chunkIndex);
    if(bytes != null)
    {
        console.log("Result obtained by daemon.peak(...)");

        sliceAndCallback(bytes);
    }
    else
    {
        // peak failed -> readFrom(index)
        self.daemon.readFrom(chunkIndex, function(idx, b)
        {
            assert(idx == chunkIndex, "readFrom callback error");
            
            sliceAndCallback(b);
        });
    }
    
}

function _streamPeak(self, offset)
{
    if(self.position < offset)
    {
        return null;
    }

    // I decided not to call preload()
    // so peak(...) does not have side effects

    console.log("Peak at offset " + offset);

    var chunkIndex = _getIndex(self.offsetList, offset);
    if(chunkIndex > self.offsetList.length - 1) // EOF
    {
        return new ArrayBuffer();
    }

    var difference = offset - self.offsetList[chunkIndex];
    var chunkBytes = self.daemon.peak(chunkIndex);

    assert(difference >= 0, "bug found");

    if(chunkBytes == null)
    {
        return null;
    }
    else
    {
        if(difference == 0)
        {
            return chunkBytes;
        }
        else
        {
            return chunkBytes.slice(difference);
        }
    }
}

function _startDl(self)
{
    if(!self.dlStarted)
    {
        self["dlStarted"] = true;
        downloadBigFile(self.jsonPath, self.events);
    }
}

function _getIndex(offsetList, offset)
{
    if(offset < offsetList[0])
    {
        throw "offset < lower bound";
    }

    if(offset >= offsetList[offsetList.length - 1]) // offset is outside the file
    {
        return offsetList.length - 1; // the last chunk is "fake"
    }
    else
    {
        return _offsetBinarySearch(offsetList, offset);
    }
}