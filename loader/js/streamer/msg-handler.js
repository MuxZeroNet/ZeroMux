function needAppending(currentTime, bufferedRanges)
{
    // MDN:
    // This object is normalized, which means that ranges
    // are ordered, don't overlap, aren't empty,
    // and don't touch (adjacent ranges are folded into one bigger range).

    for(var i = 0; i < bufferedRanges.length; i++)
    {
        var rangeStart = bufferedRanges.start(i);
        var rangeEnd = bufferedRanges.end(i);

        // [   |  ]
        if(rangeStart <= currentTime && currentTime <= rangeEnd)
        {
            return (currentTime + 180 > rangeEnd) ? "append" : "no";
        }
        // | [       ]
        else if(rangeStart > currentTime)
        {
            return "seek";
        }

        // else
        // {
        //     [      ]   |
        //              [       ]
        // }
    }

    // [      ]  [   ] [  ]   [      ]     |

    // if too far away, seek
    if(bufferedRanges.length > 0)
    {
        if (currentTime - bufferedRanges.end(bufferedRanges.length - 1) > 60)
        {
            return "seek";
        }
    }

    return "append";

}

function playbackStuck(currentTime, lastSeekTime)
{
    var delta = currentTime - lastSeekTime;
    return (delta >= 0 && delta < 1);
}


function spawnMp4Worker(moovBox, callback, failure)
{
    var scriptPath = getScriptFolder("msg-handler.js").join("/");
    var deps = ["mp4parser.js", "mp4alg.js", "mp4builder.js"].map
    (
        item => scriptPath + "/" + item
    );
    var absDeps = getAbsoluteUrls(deps);

    simplerWorker(scriptPath + "/mp4worker.js", function(worker)
    {
        _workerMade(worker, absDeps, moovBox, callback, failure);
    });
}

function _workerMade(worker, absDeps, moovBox, callback, failure)
{
    var logWorkerError = function (e)
    {
        console.error("Worker Error: "
            + e.filename + " Line " + e.lineno + ":\n" + e.message);
    };
    worker.onerror = function(e)
    {
        logWorkerError(e);
        failure();
    };

    worker.onmessage = function(e)
    {
        console.log(e.data);
        // e.data == [cmd, args]

        if(e.data[0] == "signal")
        {
            if(e.data[1] == "imported")
            {
                // load moov box
                worker.postMessage(["moov", moovBox]);
            }
            else if(e.data[1] == "samplesLoaded")
            {
                // worker initialized
                worker.onmessage = null;
                worker.onerror = logWorkerError;
                callback(worker);
            }
        }
        else
        {
            console.warn("Bad command: " + e.data[0]);
        }
    };

    worker.postMessage(["import", absDeps]);
}

function pipeToBuffer(worker, stream, mediaSource, sourceBuffer, fnCurrentTime, fnRanges)
{
    var failedBuffer = null;
    var failureCount = 0;

    var lastSeek = [-1];

    var next = function(streamEnded=false)
    {
        _blockingAppend(worker, fnCurrentTime, fnRanges, lastSeek, streamEnded);
    };

    var appendAndNext = function(buffer)
    {
        console.log("appending buffer");
        try
        {
            failureCount = 0;
            sourceBuffer.appendBuffer(buffer);
        }
        catch(error)
        {
            if(error.name == "QuotaExceededError")
            {
                console.warn("Quota Exceeded. Removing data..." + failureCount);
                failedBuffer = buffer;
                failureCount = failureCount + 1;

                var start = 0;
                var end = 0;
                if(failureCount == 1)
                {
                    start = 0;
                    end = fnCurrentTime();
                }
                else
                {
                    start = 0;
                    end = mediaSource.duration - 1;
                }


                if (start < end)
                {
                    sourceBuffer.remove(start, end);
                }
                else
                {
                    console.log("WTF");
                }

            }
        }
    };

    sourceBuffer.addEventListener('updateend', function(e)
    {
        console.log("update end");

        if(failureCount == 0)
        {
            failedBuffer = null;
            next();
        }
        else
        {
            console.log("Retrying append buffer");
            appendAndNext(failedBuffer);
        }
    });

    var endSource = function()
    {
        console.log("MSE stream ended.");
        // keep _blockingAppend running.
        // Don't append, but should handle seek
        next(true);
    };

    var streamCb = function(offset, data)
    {
        worker.postMessage(["mp4", data]);
    };

    worker.onmessage = function(e)
    {
        var cmd = e.data[0];
        var args = e.data[1];

        if(cmd == "signal")
        {
            if(args == "wantMore")
            {
                _dataReader(worker, stream, "current", streamCb);
            }
            else if(args == "done")
            {
                endSource();
            }
            else
            {
                console.error("Unknown signal " + args);
            }
        }
        else if(cmd == "readFrom")
        {
            console.log("Worker wants to seek");
            _dataReader(worker, stream, args[0], streamCb);
        }
        else if(cmd == "mp4")
        {
            appendAndNext(args);
        }
        else
        {
            console.error("Bad command " + cmd);
        }
    };

    return next;
}

function _dataReader(worker, stream, offset, streamCb)
{
    stream.readFrom(offset, function(o, data)
    {
        if(data == null)
        {
            console.error("Read failed.");
        }
        else if(data.byteLength == 0)
        {
            console.warn("EOF");
        }
        else
        {
            streamCb(o, data);
        }
    });
}

function _blockingAppend(worker, fnCurrentTime, fnRanges, lastSeek, streamEnded)
{
    var wait = function()
    {
        var decision = needAppending(fnCurrentTime(), fnRanges());

        if(decision == "append" && !streamEnded)
        {
            lastSeek[0] = -1; // set last decision to !seek
            worker.postMessage(["signal", "continue"]);
        }
        else if(decision == "seek" && lastSeek[0] >= 0 && playbackStuck(fnCurrentTime(), lastSeek[0]))
        {
            // range still not loaded, last decision was seek, progress bar got stuck since last seek
            console.log("Seek not completed...");
            worker.postMessage(["signal", "continue"]);
        }
        else if(decision == "seek")
        {
            // seek
            var currentTime = fnCurrentTime();
            lastSeek[0] = currentTime;
            worker.postMessage(["seek", currentTime]);
        }
        else
        {
            requestAnimationFrame(wait);
        }

        // TODO: failsafe
        // if reports "don't append"
        // but playback got stuck for a long time, seek
    };

    requestAnimationFrame(wait);
}
