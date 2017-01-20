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
            + evt.filename + " Line " + evt.lineno + ":\n" + evt.message);
    };

    worker.onmessage = function(e)
    {
        console.log("_workerMade");
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

