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

    for (trakBox of tracks)
    {
        var sampleInfo = ExtractSamplePointers(trakBox);
        // extract `sampleInfo` in this track.
        sampleInfoList.push(sampleInfo);
        // remember it

        var trackId = GetTrackId(sampleInfo);
        var maxChunkNumber = GetMaxChunkNumber(sampleInfo);

        var newTrak = CollectBoxesBuildNewTrak(trakBox);
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

        var handlerString = sampleInfo["codecInfo"]["handlerString"];
        handlerList.push(handlerString);
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

videoSampleInfo = null;
videoSampleTable = null;

audioSampleInfo = null;
audioSampleTable = null;

kfList = null;

maxVideoSample = 0;
maxAudioSample = 0;

videoTrackId = 0;
audioTrackId = 0;

function loadSamples()
{
    vIndex = GetVideoTrackIndex(handlerList);
    aIndex = GetAudioTrackIndex(handlerList);

    videoSampleInfo = sampleInfoList[vIndex];
    videoSampleTable = GetSampleTable(videoSampleInfo);

    audioSampleInfo = sampleInfoList[aIndex];
    audioSampleTable = GetSampleTable(audioSampleInfo);

    kfList = GetKeyFrameList(videoSampleInfo);

    maxVideoSample = GetMaxSampleNumber(videoSampleInfo);
    maxAudioSample = GetMaxSampleNumber(audioSampleInfo);

    videoTrackId = trackIdList[vIndex];
    audioTrackId = trackIdList[aIndex];


    workerState = "samplesLoaded";
}

function writeHeader(fileInfo)
{
    if (fileInfo.beginOffset != 0 || fileInfo.pointer != 0)
    {
        throw "Worker: writeHeader: offset?/pointer?";
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

    ftypBytes = PackBox(ftypBox);

    workerState = "writingFragments";

    var bytesToWrite = concatArrays(ftypBytes, newMoovBytes);
    return bytesToWrite;
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
    var fromFrame = kfList[i];
    var toFrame = (i < kfList.length - 1) ? (kfList[i+1] - 1) : maxVideoSample;

    var toVideoSt = FindItemInTable(toFrame, videoSampleTable);
    var toVideoChunk = toVideoSt[0];
    var toVideoChunkOffset = GetChunkOffset(toVideoChunk, videoSampleInfo);


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
        videoSampleTable, videoSampleInfo,
        fileInfo, i*2 + 1);

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
    var audioToFrame = (i < kfList.length - 1) ? GetAudioFrameEnd(toVideoChunkOffset, audioSampleTable, audioSampleInfo) : maxAudioSample; // all audio frames before that video frame

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
        audioSampleTable, audioSampleInfo,
        fileInfo, i*2 + 2);

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

    //writeBytes(bytesToWrite);

    return bytesToWrite;
}


function BuildFragment(fromFrame, toFrame, trackId, handler, sampleTable, sampleInfo, fileInfo, seqNumber)
{
    var moof = CollectBoxesBuildNewMoof(trackId, handler,
                                        fromFrame, toFrame,
                                        sampleInfo, seqNumber);
    // build moof
    // fileInfo is not required

    var data = GetFrameData(fromFrame, toFrame, sampleTable, sampleInfo, fileInfo);

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

function GetKeyFrameList(sampleInfo)
{
    var kfList = sampleInfo["codecInfo"]["keyframeNumberList"];
    return kfList;
}

function GetAudioFrameEnd(beforeOffset, audioSampleTable, audioSampleInfo)
{
    audioChunkNumber = FirstChunkBeforeOffset(beforeOffset, audioSampleInfo);
    if (audioChunkNumber < 0)
    {
        return -1;
    }
    tableItem = audioSampleTable[audioChunkNumber-1];

    firstSample = tableItem[2];
    sampleCount = tableItem[3];

    return firstSample + sampleCount - 1;
}

function GetAudioTrackIndex(handlerList)
{
    //for i in range(len(handlerList)):
    for(var i = 0; i < handlerList.length; i++)
    {
        if (handlerList[i] == "soun")
        {
            return i;
        }
    }

    throw "No audio tracks.";
}

function GetVideoTrackIndex(hanlderList)
{
    for(var i = 0; i < handlerList.length; i++)
    {
        if (handlerList[i] == "vide")
        {
            return i;
        }
    }

    throw "No video tracks.";
}




function writeBytes(bytes)
{
    postMessage(["mp4", bytes]);
}

function signal(args)
{
    postMessage(["signal", args]);
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


function writeNextFragment(f)
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

    var fileInfo = f;
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


function cleanUpBuffer(pointer)
{
    beginOffset += pointer;
    buffer = buffer.slice(pointer);
}


var beginOffset = 0;
var buffer = new Uint8Array(0);




function handleSignal(args)
{
    switch(args)
    {
        case "continue": // sent by MSE
            handleMp4(null);
            break;

        case "noData": //sent by `wait`
            console.log("Worker: no data received. We are done.");
            workerState = "done";
            signal("done");
            break;

        default:
            console.log("MP4 worker: unrecognized signal");
            break;
    }
}



function requestAsync(url, minetype, responseType, callback, failure)
{
    var xmlHttp = new XMLHttpRequest();

    xmlHttp.onload = function()
    {
        callback(xmlHttp);
    }

    xmlHttp.onerror = function(reason)
    {
        failure(xmlHttp, reason);
    }

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
    requestAsync(url, null, responseType, callback, failure)
}
