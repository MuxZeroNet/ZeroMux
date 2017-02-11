// stream daemon

function nop() { }

function initDaemonFns()
{
    // input
    var dataInput = {
        getStopSignal: nop,
        getLoadedRange: nop,
        getBufferReference: nop,
    };

    // output
    var callbacks = {
        onDataOutput: nop,
        onStopped: nop,
    };

    return {"dataInput": dataInput, "callbacks": callbacks};
}

function initDaemon(daemonFns)
{
    var daemon = {};

    daemon["_daemonLoadedIndex"] = -1;
    daemon["_daemonStopped"] = true;
    daemon["_daemonException"] = "not started";
    daemon["_rangeStart"] = 0;
    daemon["_allowSeeking"] = true;

    daemon.getDaemonLoadedIndex = function()
    {
        return daemon["_daemonLoadedIndex"];
    };
    daemon.setDaemonLoadedIndex = function(val)
    {
        daemon["_daemonLoadedIndex"] = val;
    };

    daemon.getDaemonStopped = function()
    {
        return daemon["_daemonStopped"];
    };
    daemon.setDaemonStopped = function(val)
    {
        daemon["_daemonStopped"] = val;
    };

    daemon.getDaemonException = function()
    {
        return daemon["_daemonException"];
    };
    daemon.setDaemonException = function(val)
    {
        daemon["_daemonException"] = val;
    };

    daemon.getRangeStart = function()
    {
        return daemon["_rangeStart"];
    };
    daemon.setRangeStart = function(val)
    {
        if(val < 0)
        {
            throw "set range start: Invalid argument";
        }

        daemon["_rangeStart"] = val;
    };

    daemon.allowsSeeking = function()
    {
        return daemon["_allowSeeking"];
    };
    daemon.setAllowSeeking = function(val)
    {
        daemon["_allowSeeking"] = val;
    };

    daemon._redirectOutput = function(callback)
    {
        if(callback == null)
        {
            return daemonFns;
        }
        else
        {
            var newFns = {};
            newFns["dataInput"] = daemonFns.dataInput;
            newFns["callbacks"] = {
                onDataOutput: callback,
                onStopped: daemonFns.callbacks.onStopped
            };
            return newFns;
        }
    }

    daemon.peek = function(index) // sync
    {
        return daemonPeek(daemon, daemonFns, index);
    };

    daemon.waitAndLoadNext = function(callback=null)
    {
        daemon.readFrom(daemon.getDaemonLoadedIndex() + 1, callback);
    };

    daemon.readFrom = function(index, callback=null)
    {
        var newFns = daemon._redirectOutput(callback);
        waitAndLoadSegment(daemon, index, newFns);
    };

    return daemon;

    // daemon: internal daemon state selectors
    // daemonFns: external data selectors and callback functions
}

function _stopDaemon(selectors, onStopped, reason)
{
    selectors.setDaemonStopped(true);
    selectors.setDaemonException(reason);

    onStopped(selectors.getDaemonException());
}

// load next chunk and call back, when next chunk is available
// if not available, wait until it is available, and then call back
function waitAndLoadSegment(selectors, toIndex, fns, retry=1000)
{
    // daemon starts
    selectors.setDaemonStopped(false);
    selectors.setDaemonException("graceful");

    // recursion base case 1
    if(retry <= 0)
    {
        console.warn("Daemon: Bad network environment! Read timed out.");

        fns.onDataOutput(toIndex, null); // timed out

        return;
    }

    // recursion base case 2
    else if(toIndex > fns.dataInput.getBufferReference().length - 1)
    {
        console.info("Daemon: Reached end of stream. Stop Iteration.");

        // tell main thread
        _stopDaemon(selectors, fns.callbacks.onStopped, "graceful: EOF");

        return;
    }

    // stop signal detected
    else if(fns.dataInput.getStopSignal())
    {
        console.error("Daemon: aborted.");

        // tell main thread daemon was aborted
        _stopDaemon(selectors, fns.callbacks.onStopped, "exception: aborted");

        return;
    }


    // `toIndex` domain check
    if(toIndex < 0)
    {
        _stopDaemon(selectors, fns.callbacks.onStopped, "exception: toIndex < 0");
        return;
    }

    var rangeStart = selectors.getRangeStart();
    var rangeEnd = selectors.getDaemonLoadedIndex();

    // we have already loaded that chunk
    if(rangeStart <= toIndex && toIndex <= rangeEnd)
    {
        if(!selectors.allowsSeeking())
        {
            console.warn("Chunk " + toIndex + " cannot be loaded twice. " +
                "Daemon has loaded chunks [" + rangeStart + ", " + rangeEnd + "].");

            // tell main thread daemon was aborted
            _stopDaemon(selectors, fns.callbacks.onStopped, "exception: toIndex");

            return;
        }
        else
        {
            console.log("Returning loaded chunk " + toIndex);
        }
    }

    // else: that chunk hasn't been loaded
    // and it is too far
    else if(toIndex - rangeEnd > 1 || toIndex < rangeStart)
    {
        if(!selectors.allowsSeeking())
        {
            console.error("Daemon: That chunk is too far. " +
                "You want index " + toIndex + ". " +
                "Daemon has data in [" + rangeStart + ", " + rangeEnd + "].");

            // tell main thread daemon was aborted
            _stopDaemon(selectors, fns.callbacks.onStopped, "exception: toIndex");

            return;
        }
        else
        {
            console.log("Daemon: Seeking to index "
                + toIndex + ". [" + rangeStart + ", " + rangeEnd + "]");

            selectors.setDaemonLoadedIndex(toIndex - 1); // move position pointer
            selectors.setRangeStart(toIndex); // advise downloader
        }
    }

    // move pointer and load chunk `toIndex`

    var dlRange = fns.dataInput.getLoadedRange();
    var loadedFrom = dlRange[0];
    var loadedTo = dlRange[1];

    // if toIndex is outside loaded range
    if(loadedTo < loadedFrom || toIndex < loadedFrom || toIndex > loadedTo)
    {
        // We are too fast, sleep.
        setTimeout(function()
        {
            waitAndLoadSegment(selectors, toIndex, fns, retry - 1);
        }, 500 + 500*(retry/500));

        return;
    }


    console.log("Daemon: loading index " + toIndex);

    selectors.setDaemonLoadedIndex(toIndex); // move pointer

    fns.callbacks.onDataOutput(toIndex, fns.dataInput.getBufferReference()[toIndex]);

}

function daemonPeek(self, fns, index)
{
    if(self.getDaemonStopped())
    {
        return null;
    }

    var dlRange = fns.dataInput.getLoadedRange();
    if(dlRange[1] < dlRange[0] || index < dlRange[0] || index > dlRange[1])
    {
        return null;
    }

    return fns.dataInput.getBufferReference()[index];
}
