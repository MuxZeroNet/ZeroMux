// stream daemon

function nop() { }

function initDaemonFns()
{
    // input
    var dataInput = {
        getStopSignal: nop,
        getLatestAvailableIndex: nop,
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
    deamon["_daemonWants"] = 0;
    
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

    daemon.getDaemonAdvice = function()
    {
        return daemon["_daemonWants"];
    };
    daemon.setDaemonAdvice = function(val)
    {
        if(val < 0)
        {
            throw "set advice: Invalid argument";
        }

        daemon["_daemonWants"] = val;
    };

    daemon.peak = function(index)
    {
        return daemonPeak(daemon, index);
    };

    
    daemon.waitAndLoadNext = function()
    {
        waitAndLoadSegment(
            daemon, // self
            daemon.getDaemonLoadedIndex() + 1,
            daemonFns,
            50
        );
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
function waitAndLoadSegment(selectors, toIndex, fns, retry=50)
{   
    // daemon starts
    selectors.setDaemonStopped(false);
    selectors.setDaemonException("graceful");
    
    // recursion base case 1
    if(retry <= 0)
    {
        console.warn("Daemon: Bad network environment! Waited for too long.");
        
        setTimeout(function()
        {
            waitAndLoadSegment(selectors, toIndex, fns, 50);
        }, 1000);
        
        return;
    }
    
    // recursion base case 2
    else if(toIndex > fns.dataInput.getBufferReference().length - 1)
    {
        console.info("Daemon: We are done. Reached end of stream.");
        
        // tell main thread
        _stopDaemon(selectors, fns.callbacks.onStopped, "graceful");
        
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
    var indexLoaded = selectors.getDaemonLoadedIndex();
    
    // we have done assigned task
    if(indexLoaded >= toIndex)
    {
        console.warn("Daemon has already loaded assigned index " + toIndex + ". " +
                     "Daemon has loaded all the way to index " + indexLoaded + ". Exit...");
        
        // tell main thread daemon was aborted
        _stopDaemon(selectors, fns.callbacks.onStopped, "exception: toIndex");
        
        return;
    }
    
    
    if(indexLoaded + 1 != toIndex)
    {
        console.error("Daemon: we cannot load more than 1 chunk at a time. " + 
                     "You assigned index " + toIndex + ". Daemon is still at index " + indexLoaded);
        
        // tell main thread daemon was aborted
        _stopDaemon(selectors, fns.callbacks.onStopped, "exception: toIndex");
        
        return;
    }
    
    
    // now we have to load things
    
    var laIndex = fns.dataInput.getLatestAvailableIndex();
    
    if(laIndex < toIndex)
    {
        // We are too fast, sleep.
        setTimeout(function()
        {
            waitAndLoadSegment(selectors, toIndex, fns, retry - 1);
        }, 500 + 1000*(retry/50));
        
        return;
    }
    
    
    console.log("Daemon: loading index " + toIndex);
    
    selectors.setDaemonLoadedIndex(toIndex);
    
    fns.callbacks.onDataOutput(toIndex, fns.dataInput.getBufferReference()[toIndex]);
    
}

function daemonPeak(self, index)
{
    if(self.getDaemonStopped())
    {
        return null;
    }
    
    if(self.getLatestAvailableIndex() < index)
    {
        return null;
    }

    return self.getBufferReference()[index];
}