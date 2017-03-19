newTrakBoxes = [];

chunkList = [];

sampleInfoList = [];
trackIdList = [];
descIndexList = [];
handlerList = [];

newMoovBytes = null;

function loadMoov(moovBoxBytes)
{
    var moovStream = newFileInfo(moovBoxBytes);

    var moovBox = ReadBox(moovStream);

    var mvhdBox = FindBox("mvhd", moovBox, true)[0];
    var duration = ExtractDuration(mvhdBox);

    var tracks = FindBox("trak", moovBox);

    for (var trakBox of tracks)
    {
        var sampleInfo = ParseSamples(trakBox);
        // extract `sampleInfo` in this track.
        sampleInfoList.push(sampleInfo);
        // remember it

        var trackId = GetTrackId(sampleInfo);
        var maxChunkNumber = GetMaxChunkNumber(sampleInfo);

        var newTrak = MakeNewTrak(trakBox);
        newTrakBoxes.push(newTrak);
        // generate new trak box, and remember it

        trackIdList.push(trackId);
        // remember track id

        //cache, sampleCount, desc = GetChunkInfo(1, sampleInfo)
        var csd = GetChunkInfo(1, sampleInfo);
        var cache = csd[0];
        var sampleCount = csd[1];
        var desc = csd[2];

        descIndexList.push(desc);
        // description index

        handlerList.push(sampleInfo.handlerString);
        // remember handler string

        //for chunkNumber in range(1, maxChunkNumber+1):
        for(var chunkNumber = 1; chunkNumber < maxChunkNumber+1; chunkNumber++)
        {
            var offset = GetChunkOffset(chunkNumber, sampleInfo);
            chunkList.push( [offset, trackId, chunkNumber] );
        }
    }

    //chunkList.sort(key=lambda x: x[0]);
    chunkList.sort((a, b) => a[0] - b[0]);

    var newMvex = BuildNewMvexBox(duration, trackIdList, descIndexList);
    var newMoov = BuildNewMoovBox(mvhdBox, newTrakBoxes, newMvex);

    newMoovBytes = PackBox(newMoov);
    // remember the new moov

    loadSamples();

    return newMoovBytes;

}



vIndex = null;
aIndex = null;

videoSamples = null;
audioSamples = null;

kfList = null;
seekTable = null;

maxVideoSample = 0;
maxAudioSample = 0;

videoTrackId = 0;
audioTrackId = 0;

initSegment = null;

function loadSamples()
{
    vIndex = TrackIndex(handlerList, "vide");
    aIndex = TrackIndex(handlerList, "soun");

    videoSamples = sampleInfoList[vIndex];
    audioSamples = sampleInfoList[aIndex];

    kfList = KeyFrameList(videoSamples);
    seekTable = MakeSeekTable(videoSamples, audioSamples);

    maxVideoSample = GetMaxSampleNumber(videoSamples);
    maxAudioSample = GetMaxSampleNumber(audioSamples);

    videoTrackId = trackIdList[vIndex];
    audioTrackId = trackIdList[aIndex];


    workerState = "samplesLoaded";
}

function writeHeader(fileInfo)
{
    if (fileInfo.beginOffset != 0 || fileInfo.pointer != 0)
    {
        throw "Worker: writeHeader: Invalid position";
    }
    if (fileInfo.dataView.byteLength < 4)
    {
        // no enough data
        return null;
    }

    var boxSize = fileInfo.readI();
    fileInfo.pointer = 0;
    if (fileInfo.dataView.byteLength < boxSize)
    {
        // no enough data
        return null;
    }

    var ftypBox = ReadBox(fileInfo);
    if (ftypBox["type"] != "ftyp")
    {
        throw "Cannot find ftyp box.";
    }

    var ftypBytes = PackBox(ftypBox);

    // workerState = "writingFragments";

    var bytesToWrite = concatArrays(ftypBytes, newMoovBytes);
    return bytesToWrite; // init segment
}


currentKeyFrameIndex = 0;
audioFromFrame = 1;

function writeFragment(fileInfo)
{
    var i = currentKeyFrameIndex;

    if (i > kfList.length - 1)
    {
        throw "kfList index out of bounds";
    }

    // video
    var fromFrame = kfList[i]; // find a key frame
    var toFrame = (i < kfList.length - 1) ? (kfList[i+1] - 1) : maxVideoSample;

    var toVideoSt = FindItemInTable(toFrame, videoSamples.table);
    var toVideoChunk = toVideoSt[0];
    var toVideoChunkOffset = GetChunkOffset(toVideoChunk, videoSamples);


    // wait until the whole chunk is loaded
    var shouldBeLoaded = toVideoChunkOffset + toVideoSt[1] - 1; // offset


    var currentlyLoaded = fileInfo.beginOffset + fileInfo.dataView.byteLength - 1; //offset
    if (currentlyLoaded < shouldBeLoaded)
    {
        // no enough data
        return null;
    }



    var vMoof_vMdat = BuildFragment(
        fromFrame, toFrame,
        videoTrackId, "vide",
        videoSamples,
        fileInfo, i*2 + 1
    );

    if (vMoof_vMdat == null)
    {
        // no enough data
        return null;
        // This is rare because we always wait until
        // the whole chunk where `toFrame` is is loaded.
    }

    var vMoof = vMoof_vMdat[0];
    var vMdat = vMoof_vMdat[1];


    // audio
    var audioToFrame = (i < kfList.length - 1)
        ? GetAudioFrameEnd(toVideoChunkOffset, audioSamples)
        : maxAudioSample; // all audio frames before that video frame

    console.log("video: from " + fromFrame + " to " + toFrame);
    console.log("audio: from " + audioFromFrame + " to " + audioToFrame);

    if (audioFromFrame > maxAudioSample)
    {
        console.log("WARNING: audioFromFrame out of bounds");
        return; // out of bounds
    }


    var aMoof_aMdat = BuildFragment(
        audioFromFrame, audioToFrame,
        audioTrackId, "soun",
        audioSamples,
        fileInfo, i*2 + 2
    );

    if (aMoof_aMdat == null)
    {
        // no enough data
        return null;
    }

    var aMoof = aMoof_aMdat[0];
    var aMdat = aMoof_aMdat[1];

    // iteration
    audioFromFrame = audioToFrame + 1;
    currentKeyFrameIndex = currentKeyFrameIndex + 1;

    // bytes to write
    var vFrag = concatArrays(vMoof, vMdat);
    var aFrag = concatArrays(aMoof, aMdat);
    var bytesToWrite = concatArrays(vFrag, aFrag);

    return bytesToWrite;
}


function BuildFragment(fromFrame, toFrame, trackId, handler, sampleInfo, fileInfo, seqNumber)
{
    var moof = MakeNewMoof(trackId, handler,
                           fromFrame, toFrame,
                           sampleInfo, seqNumber);
    // build moof
    // fileInfo is not required

    var data = GetFrameData(fromFrame, toFrame, sampleInfo, fileInfo);

    if (data == null)
    {
        return null; // no enough data
    }

    var mdat = BuildNewMdatBox(data);
    // build mdat

    var moofBytes = PackBox(moof);
    var mdatBytes = PackBox(mdat);

    return [moofBytes, mdatBytes];
}

function KeyFrameList(sampleInfo)
{
    return sampleInfo.keyframeNumberList;
}

function GetAudioFrameEnd(beforeOffset, audioSamples, chunkNumber=-1)
{
    if(chunkNumber < 0)
    {
        chunkNumber = FirstChunkBeforeOffset(beforeOffset, audioSamples);
    }
    if (chunkNumber < 0)
    {
        return -1;
    }

    var tableItem = audioSamples.table[chunkNumber - 1];
    var firstSample = tableItem[2];
    var sampleCount = tableItem[3];

    return firstSample + sampleCount - 1;
}


function SampleChunkOffset(samples, frame)
{
    var item = FindItemInTable(frame, samples.table);
    var chunk = item[0];
    var chunkOffset = GetChunkOffset(chunk, samples);
    return chunkOffset;
}

// Seek table constructor and selectors

function MakeSeekTable(videoSamples, audioSamples)
{
    // [Timestamp, Keyframe Index, Keyframe Number, Offset, audioFrom]
    var result = [];

    var list = KeyFrameList(videoSamples);
    for(var i = 0; i < list.length; i++)
    {
        var number = list[i]; // key frame number
        var ts = GetSampleTimestamp(number, videoSamples)[0]; // abs decode time
        var beforeOffset = SampleChunkOffset(videoSamples, number); // video chunk offset
        var audioFrom = GetAudioFrameEnd(beforeOffset, audioSamples); // audio frame before video
        // returns -1 if no audio before offset 0 (first video chunk)
        var offset = 0;
        if (audioFrom > 0)
        {
            offset = SampleChunkOffset(audioSamples, audioFrom); // audio chunk offset
        }
        else
        {
            audioFrom = 1;
        }

        result.push([ts, i, number, offset, audioFrom]);
    }

    result = result.sort((a, b) => a[0] - b[0]);

    console.log("--- Seek table ---");

    return result;
}

function seekTimestamp(seekItem)
{
    return seekItem[0];
}

function seekFrameIndex(seekItem)
{
    return seekItem[1];
}

function seekFrameNumber(seekItem)
{
    return seekItem[2];
}

function seekOffset(seekItem)
{
    return seekItem[3];
}

function seekAudioFrom(seekItem)
{
    return seekItem[4];
}


function TrackIndex(handlerList, trackName)
{
    var index = handlerList.indexOf(trackName);
    if(index < 0)
    {
        throw "No " + trackName + " tracks.";
    }

    return index;
}


// Signal Handling


function writeBytes(bytes)
{
    postMessage(["mp4", bytes]);
}

function signal(args)
{
    postMessage(["signal", args]);
}

function signalReadFrom(offset, initSegment)
{
    postMessage(["readFrom", [offset, initSegment]]);
}

workerState = "notRunning"; // notRunning samlpesLoaded writingFragments done

onmessage = function(e)
{
    var cmd = e.data[0];
    var args = e.data[1];

    switch(cmd)
    {
        case "import":
            handleImport(args);
            break;

        case "moov":
            handleMoov(args);
            break;

        case "mp4":
            handleMp4(args);
            break;

        case "seek":
            handleSeek(args);
            break;

        case "signal":
            handleSignal(args);
            break;

        default:
            console.warn("MP4 worker: BAD COMMAND");
            break;
    }
};

function handleImport(args)
{
    if (args.length == 0)
    {
        signal("imported");
        return;
    }

    var src = args[0];

    console.info(src);

    requestBinary(src, "blob", function(xmlHttp)
    {
        importScripts( URL.createObjectURL(xmlHttp.response) );
        handleImport(args.slice(1));

    }, function (xmlHttp, reason)
    {
        signal("importFailed");
    });


}

function handleMoov(args)
{
    loadMoov(args); // arraybuffer
    // It will NOT signal the main thread.

    signal("samplesLoaded");
}

function handleMp4(args)
{
    if (args != null) // New data are coming.
    {
        var bytes = new Uint8Array(args); // args: arraybuffer
        // add to buffer
        buffer = concatArrays(buffer, bytes);
        // but don't touch beginOffset
    }

    var fileInfo = newFileInfo(buffer.buffer);
    fileInfo.beginOffset = beginOffset;

    if (workerState == "samplesLoaded")
    {
        // write header
        var headerBytes = writeHeader(fileInfo); // will NOT signal main thread

        if (headerBytes == null)
        {
            console.log("writeHeader: No enough data, asking for more...");
            signal("wantMore");
        }
        else
        {
            workerState = "writingFragments";
            initSegment = headerBytes;
            writeBytes(headerBytes);
        }
    }
    else if (workerState == "writingFragments")
    {
        writeNextFragment(fileInfo);
        // write new fragment
    }
    else
    {
        throw "Invalid state";
    }
}


function writeNextFragment(fileInfo)
{
    // buffer, beginOffset
    // writeFragment

    if (currentKeyFrameIndex > kfList.length - 1)
    {
        // we are done
        workerState = "done";
        signal("done");
        return;
    }

    var bytesToWrite = writeFragment(fileInfo);
    // It will NOT signal the main thread.

    if (bytesToWrite == null)
    {
        console.log("writeNextFragment: No enough data, asking for more...");
        signal("wantMore");
    }
    else
    {
        // let's try cleaning up the buffer
        console.log("before cleaning: length=" + buffer.length + " offset="+beginOffset);

        cleanUpBuffer(fileInfo.pointer);

        console.log("after cleaning:  length=" + buffer.length + " offset="+beginOffset);

        // signal main thread
        writeBytes(bytesToWrite);
    }

}

function handleSeek(args)
{
    var decimalTime = args;

    // to absolute decode time
    var timestamp = Math.floor(decimalTime * videoSamples.timeScale);
    timestamp -= 5; // make it off by a little bit

    // get seek item
    var seekIndex = -1;
    if(timestamp <= seekTimestamp(seekTable[0]))
    {
        seekIndex = 0;
    }
    if(timestamp >= seekTimestamp(seekTable[seekTable.length - 1]))
    {
        seekIndex = seekTable.length - 1;
    }
    else
    {
        seekIndex = TableBinarySearch(seekTable, timestamp, 0); // [0] -- ts
    }
    var seekItem = seekTable[seekIndex];


    // change fragmentation states
    workerState = "writingFragments";
    currentKeyFrameIndex = seekFrameIndex(seekItem);

    var rawFromFrame = seekAudioFrom(seekItem);
    audioFromFrame = (rawFromFrame > 1) ? rawFromFrame : 1;

    // seek to a heuristic offset
    var offset = seekOffset(seekItem);

    beginOffset = offset;
    buffer = new Uint8Array(0);

    console.log("Seeking to " + decimalTime + " (" + timestamp + ") offset=" + offset
        + "\nvideo from=" + seekFrameNumber(seekItem) + " audio from=" + audioFromFrame);

    if(Math.abs(seekTimestamp(seekItem) - timestamp) > 20 * videoSamples.timeScale)
    {
        console.error("Too far!");
    }
    else
    {
        signalReadFrom(offset, initSegment);
    }
}


function cleanUpBuffer(pointer)
{
    beginOffset += pointer;
    buffer = buffer.slice(pointer);
}


var beginOffset = 0;
var buffer = new Uint8Array(0);




function handleSignal(args)
{
    if(args == "continue" || args == "next")
    {
        handleMp4(null);
    }
    else if(args == "noData" || args == "eof")
    {
        console.log("Worker: EOF received. We are done.");
        workerState = "done";
        signal("done");
    }
    else
    {
        console.log("MP4 worker: unrecognized signal");
    }
}



function requestAsync(url, minetype, responseType, callback, failure)
{
    var xmlHttp = new XMLHttpRequest();

    xmlHttp.onload = function()
    {
        callback(xmlHttp);
    };

    xmlHttp.onerror = function(reason)
    {
        failure(xmlHttp, reason);
    };

    xmlHttp.onabort = xmlHttp.onerror;
    xmlHttp.ontimeout = xmlHttp.onerror;

    xmlHttp.open("GET", url, true);

    xmlHttp.timeout = 20000;

    if (minetype != null)
    {
        xmlHttp.overrideMimeType(minetype);
    }

    if (responseType != null)
    {
        xmlHttp.responseType = responseType;
    }

    try
    {
        xmlHttp.send(null);
    }
    catch(exception)
    {
        failure(xmlHttp, exception);
    }

}

function requestBinary(url, responseType, callback, failure)
{
    requestAsync(url, null, responseType, callback, failure);
}
