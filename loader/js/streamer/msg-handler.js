function needAppending(currentTime, bufferedRanges)
{
    for(var i = 0; i < bufferedRanges.length; i++)
    {
        var rangeStart = bufferedRanges.start(i);
        var rangeEnd = bufferedRanges.end(i);

        if(rangeStart <= currentTime && currentTime <= rangeEnd)
        {
            return (currentTime + 180 > rangeEnd);
        }
    }

    return true;
}

function dummyQueries()
{
    return "_r=" + Math.random();
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
        _workerMade(worker, absDeps, moovBox, callback, failure)
    });
}

function _workerMade(worker, absDeps, moovBox, callback, failure)
{
    worker.onerror = function (e)
    {
        console.error("Worker Error: "
            + e.filename + " Line " + e.lineno + ":\n" + e.message);
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

function pipeToBuffer(worker, stream, mediaSource, sourceBuffer)
{
    var next = function()
    {
        worker.postMessage(["signal", "continue"]);
    };

    var appendAndNext = function(buffer)
    {
        console.log("appending buffer");
        sourceBuffer.appendBuffer(buffer);
    };

    sourceBuffer.addEventListener('updateend', function(e)
    {
        console.log("update end");
        next();
    });

    var endSource = function()
    {
        console.log("MSE stream ended.");
        // mediaSource.endOfStream();
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
