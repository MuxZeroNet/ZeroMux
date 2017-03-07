function streamError(msg)
{
    console.error("Stream Error: " + msg);
    return {
        "error": msg
    };
}

function hasStreamError(obj)
{
    return obj.hasOwnProperty("error");
}

function streamErrorMsg(obj)
{
    return obj["error"];
}

function streamArgs(jsonPath, moovPath, codecs)
{
    return {
        "jsonPath": jsonPath,
        "moovPath": moovPath,
        "codecs": codecs,
    };
}

function withUserEvents(args, events)
{
    args["events"] = events;
}

function downloadAndAttach(args, videoElement, cbFn)
{
    var nop = function() {};
    var callback = cbFn || nop;

    var success = function(xmlHttp)
    {
        _createSource(args, readFileJson(xmlHttp.responseText), videoElement, callback);
    };

    var failure = function(xmlHttp, reason)
    {
        callback(streamError("Failed to download file.json"));
    };

    // request JSON
    requestText(args.jsonPath + "?" + noCacheQueries(), "application/json", success, failure);
}


function _createSource(args, jsonObj, videoElement, callback)
{
    var nop = function() {};

    var obj = {};
    // create Media Source and attach it to <video> element
    createMediaSource(args.codecs, videoElement, function(e)
    {
        if(e == null)
        {
            callback(streamError("Can't create media source."));
            return;
        }

        obj["mediaSource"] = e[0];
        obj["sourceBuffer"] = e[1];
        obj["mediaUrl"] = e[2];

        obj["fnCurrentTime"] = function()
        {
            return videoElement.currentTime;
        };
        obj["fnRanges"] = function()
        {
            return videoElement.buffered;
        };

        // make byte stream
        var userEvents = args.events || initEventObj()
        obj["stream"] = newByteStream(args.jsonPath, jsonObj[1], userEvents);

        _dlMoov(args, obj, callback);
    });
}

function _dlMoov(args, obj, callback, retry=5)
{
    var success = function(xmlHttp)
    {
        _makeMux(args, obj, xmlHttp.response, callback)
    };

    var failure = function(xmlHttp, reason)
    {
        if(retry < 0)
        {
            callback(streamError("Failed to download moov box."));
        }
        else
        {
            console.warn("Failed to load moov. Retrying..." + retry);
            setTimeout(function()
            {
                _dlMoov(args, obj, callback, retry - 1)
            }, 1000);
        }
    };

    console.log("Downloading moov box......");
    requestBinary(args.moovPath + "?" + noCacheQueries(), "arraybuffer", success, failure);
}

function _makeMux(args, obj, moov, callback)
{
    // make MP4 Multiplexer
    var success = function(worker)
    {
        obj["worker"] = worker;

        // pipe Mux
        obj["next"] = pipeToBuffer(worker, obj.stream, obj.mediaSource, obj.sourceBuffer,
            obj.fnCurrentTime, obj.fnRanges);

        obj.stream.preload(); // (preload) start stream
        obj.next(); // start Multiplexer

        // callback
        callback(obj);
    };

    var failure = function()
    {
        callback(streamError("MP4 worker error."));
    };

    spawnMp4Worker(moov, success, failure);
}


function createMediaSource(codecs, videoElement, callback)
{
    if(!MediaSource.isTypeSupported(codecs))
    {
        callback(null);
        return;
    }

    var mediaSource = new MediaSource();
    var mediaUrl = URL.createObjectURL(mediaSource);

    var onSourceOpen = function()
    {
        var sourceBuffer = mediaSource.addSourceBuffer(codecs);

        callback([mediaSource, sourceBuffer, mediaUrl]);
    };

    mediaSource.onsourceopen = onSourceOpen;

    videoElement.src = mediaUrl;
}
