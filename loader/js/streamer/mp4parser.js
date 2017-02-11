function ReadBox(fileInfo, fullBox=false, skipContent=false)
{
    var byteLength = fileInfo.dataView.byteLength;
    var pointer = fileInfo.pointer;
    if(byteLength < 4 || pointer + 4 > byteLength)
    {
        return null; // EOF or no enough data
    }

    // sizeBytes = fileInfo.read(4)
    // boxSize = struct.unpack(">I", sizeBytes)[0]
    var boxSize = fileInfo.readI();

    if (boxSize < 8)
    {
        throw "Box size: Not implemented.";
    }

    var boxType = getString(fileInfo.read(4));

    var boxInfo = {"size": boxSize, "type": boxType};
    var bytesLeft = boxSize - 8;

    if (skipContent)
    {
        fileInfo.read(bytesLeft);
        return boxInfo;
    }


    if (fullBox)
    {
        if (bytesLeft < 4)
        {
            throw "This box is not a Full Box.";
        }
        else
        {
            // boxVersion, boxFlags = struct.unpack(">B3s", fileInfo.read(4))
            var boxVersion = fileInfo.readB();
            var boxFlags = fileInfo.read(3);

            bytesLeft = bytesLeft - 4;

            boxInfo["version"] = boxVersion;
            boxInfo["flags"] = getString(boxFlags);
        }
    }


    var boxContent = fileInfo.read(bytesLeft);
    boxInfo["content"] = boxContent;

    return boxInfo;
}

function FindBox(boxType, boxInfo, fullBox=false)
{
    var boxList = [];

    var boxContentStream = newFileInfo(boxInfo["content"].buffer);

    var box = ReadBox(boxContentStream, fullBox);

    while (box != null)
    {
        if (box["type"] == boxType)
        {
            boxList.push(box);
        }

        box = ReadBox(boxContentStream, fullBox);
    }

    if (boxList.length == 0)
    {
        boxList.push(null);
    }

    return boxList;
}

// returns a list of chunk offsets
// all offsets are absolute
function ParseStcoBox(stcoBox)
{
    var absoluteChunkOffsetList = [];

    var contentStream = newFileInfo(stcoBox["content"].buffer);

    // entryCount = struct.unpack(">I", contentStream.read(4))[0]
    var entryCount = contentStream.readI();

    if (4 + 4*entryCount != stcoBox["content"].length)
    {
        throw "stco box corrupted: no enough data";
    }

    // for i in range(entryCount):
    for(var i = 0; i < entryCount; i++)
    {
        // absoluteChunkOffset = struct.unpack(">I", contentStream.read(4))[0]
        var absoluteChunkOffset = contentStream.readI(4);
        absoluteChunkOffsetList.push(absoluteChunkOffset);
    }

    return absoluteChunkOffsetList;
}

// returns [[first chunk number, samples per chunk, description index]]
function ParseStscBox(stscBox)
{
    var sampleCounts = [];

    // contentStream = io.BytesIO(stscBox["content"])
    var contentStream = newFileInfo(stscBox["content"].buffer);

    // entryCount = struct.unpack(">I", contentStream.read(4))[0]
    var entryCount = contentStream.readI();

    if (4 + 12*entryCount != stscBox["content"].length)
    {
        throw "stsc box corrupted: no enough data";
    }

    // for i in range(entryCount)
    for(var i = 0; i < entryCount; i++)
    {
        // ("firstChunk (Number)", "samplesPerChunk", "descriptionIndex")
        // items = struct.unpack(">III", contentStream.read(12)) // 3 items
        var f = contentStream.readI();
        var s = contentStream.readI();
        var d = contentStream.readI();
        var items = [f, s, d];
        sampleCounts.push(items);
    }

    return sampleCounts;
}

// returns [constant sample size, sample size list]
function ParseStszBox(stszBox)
{
    var contentStream = newFileInfo(stszBox["content"].buffer);

    // sampleSize, sampleCount = struct.unpack(">II", contentStream.read(8))
    var sampleSize = contentStream.readI();
    var sampleCount = contentStream.readI();
    if(sampleSize > 0)
    {
        // constant sample size
        return [sampleSize, null];
    }

    if (8 + 4*sampleCount != stszBox["content"].length)
    {
         throw "stsz box corrupted: no enough data";
    }

    var sampleSizeList = [];

    // for i in range(sampleCount):
    for(var i = 0; i < sampleCount; i++)
    {
        // thisSampleSize = struct.unpack(">I", contentStream.read(4))[0]
        var thisSampleSize = contentStream.readI();
        sampleSizeList.push(thisSampleSize);
    }

    return [0, sampleSizeList];
}

// returns [[sampleCount, duration]]
function ParseSttsBox(sttsBox)
{
    var contentStream = newFileInfo(sttsBox["content"].buffer);

    var entryCount = contentStream.readI();

    if (4 + 8*entryCount != sttsBox["content"].length)
    {
        throw "stts box corrupted: no enough data";
    }

    var countDeltaTuples = [];

    // for i in range(entryCount):
    for(var i = 0; i < entryCount; i++)
    {
        // sampleCount, sampleDelta = struct.unpack(">II", contentStream.read(8))
        var sampleCount = contentStream.readI();
        var sampleDelta = contentStream.readI();

        countDeltaTuples.push([sampleCount, sampleDelta]);
    }

    return countDeltaTuples;
}

// returns [[sampleCount, timeOffset]]
function ParseCttsBox(cttsBox)
{
    if (cttsBox["version"] != 0)
    {
        throw "ctts box: version " + cttsBox["version"] + " not implemented."
    }

    var contentStream = newFileInfo(cttsBox["content"].buffer);

    var entryCount = contentStream.readI();

    if (4 + 8*entryCount != cttsBox["content"].length)
    {
        throw "ctts box corrupted: no enough data";
    }

    var countOffsetTuples = [];

    //for i in range(entryCount):
    for(var i = 0; i < entryCount; i++)
    {
        //sampleCount, timeOffset = struct.unpack(">II", contentStream.read(8))
        var sampleCount = contentStream.readI();
        var timeOffset = contentStream.readI();

        countOffsetTuples.push([sampleCount, timeOffset]);
    }

    return countOffsetTuples;
}

// returns a list of key frame numbers
function ParseStssBox(stssBox)
{
    var contentStream = newFileInfo(stssBox["content"].buffer);

    //entryCount = struct.unpack(">I", contentStream.read(4))[0]
    var entryCount = contentStream.readI();

    if (4 + 4*entryCount != stssBox["content"].length)
    {
        throw "stss box corrupted: no enough data";
    }

    var keyframeNumberList = [];

    //for i in range(entryCount):
    for(var i = 0; i < entryCount; i++)
    {
        //sampleNumber = struct.unpack(">I", contentStream.read(4))[0]
        var sampleNumber = contentStream.readI();
        keyframeNumberList.push(sampleNumber);
    }

    return keyframeNumberList;
}


function ExtractTrackId(tkhdBox)
{
    var contentStream = newFileInfo(tkhdBox["content"].buffer);
    if (tkhdBox["version"] == 1)
    {
        //contentStream.read(8 * 2); // skip other fields
        contentStream.pointer += 8 * 2;
    }
    else
    {
        //contentStream.read(4 * 2);
        contentStream.pointer += 4 * 2;
    }
    var trackId = contentStream.readI();
    return trackId;
}

function ExtractHandler(hdlrBox)
{
    var contentStream = newFileInfo(hdlrBox["content"].buffer);

    //contentStream.read(4);
    contentStream.pointer += 4; // skip reserved field

    var handlerString = getString(contentStream.read(4));
    return handlerString;
}

function ExtractDuration(mvhdBox)
{
    var contentStream = newFileInfo(mvhdBox["content"].buffer);

    if (mvhdBox["version"] == 1)
    {
        //contentStream.read(8 * 2); // skip other fields
        contentStream.pointer += 8 * 2;
    }
    else
    {
        //contentStream.read(4 * 2);
        contentStream.pointer += 4 * 2;
    }

    //contentStream.read(4);
    contentStream.pointer += 4;

    if (mvhdBox["version"] == 1)
    {
        //return struct.unpack(">I", contentStream.read(8))[0]
        throw "mvhd box version 1 is not implemented";
    }
    else
    {
        return contentStream.readI();
    }

}

function ExtractTimeScale(mdhdBox)
{
    var contentStream = newFileInfo(mdhdBox["content"].buffer);

    if (mdhdBox["version"] == 1)
    {
        throw "mdhd box: version 1 is not implemented";
    }
    
    // skip other fields
    contentStream.read(8);

    return contentStream.readI();
}

function GetSampleTable(sampleInfo)
{
    var maxChunkNumber = GetMaxChunkNumber(sampleInfo);
    var results = [];

    var prevSum = 0
    var cacheChunkNumber = 1;
    var cacheChunkInfoIndex = 0;

    // for number in range(1, maxChunkNumber+1):
    for (var number = 1; number < maxChunkNumber+1; number++)
    {
        // sample = GetChunkFirstSampleNumberM(number, sampleInfo, \
        //     startChunkNumber=cacheChunkNumber, prevSum=prevSum)
        var sample = GetChunkFirstSampleNumberM(number, sampleInfo, cacheChunkNumber, prevSum);
        // number is chunk number

        // size = GetChunkLength(number, sampleInfo, firstSampleNum=sample)
        var size = GetChunkLength(number, sampleInfo, null, sample);

        // cacheChunkInfoIndex, sampleCount, d = \
        //     GetChunkInfo(number, sampleInfo, startIndex=cacheChunkInfoIndex)
        var csd = GetChunkInfo(number, sampleInfo, cacheChunkInfoIndex);
        cacheChunkInfoIndex = csd[0]; // CACHE!
        var sampleCount = csd[1];

        results.push([number, size, sample, sampleCount]);

        cacheChunkNumber = number; // CACHE!
        prevSum = sample - 1; // CACHE!
    }
    return results;
}


function ParseSamples(trakBox)
{
    var mdiaBox = FindBox("mdia", trakBox)[0];
    var minfBox = FindBox("minf", mdiaBox)[0];
    var stblBox = FindBox("stbl", minfBox)[0];

    var chunkOffsetBox =     FindBox("stco", stblBox, true)[0];
    var samplesPerChunkBox = FindBox("stsc", stblBox, true)[0];
    var sampleSizeBox =      FindBox("stsz", stblBox, true)[0];

    var sampleDtDeltaBox =   FindBox("stts", stblBox, true)[0];
    var sampleCtOffsetBox =  FindBox("ctts", stblBox, true)[0];

    var syncSampleBox =      FindBox("stss", stblBox, true)[0];

    var trackHeaderBox =     FindBox("tkhd", trakBox, true)[0];
    var handlerBox =         FindBox("hdlr", mdiaBox, true)[0];
    var mediaHeaderBox =     FindBox("mdhd", mdiaBox, true)[0];

    var sampleInfo = {};

    // offset information
    var chunkOffsetList =    ParseStcoBox(chunkOffsetBox);
    var sampleCountEntries = ParseStscBox(samplesPerChunkBox);
    var sampleSizeInfo =     ParseStszBox(sampleSizeBox);

    // timestamp information
    var dtDeltaEntries = ParseSttsBox(sampleDtDeltaBox);
    var ctOffsetEntries = null;
    if (sampleCtOffsetBox != null)
    {
        ctOffsetEntries = ParseCttsBox(sampleCtOffsetBox);
    }

    // codec information
    var trackId = ExtractTrackId(trackHeaderBox);
    var handlerString = ExtractHandler(handlerBox);

    var timeScale = ExtractTimeScale(mediaHeaderBox);

    var keyframeNumberList = null;
    if (syncSampleBox != null)
    {
        keyframeNumberList = ParseStssBox(syncSampleBox);
    }

    sampleInfo.chunkOffsetList = chunkOffsetList;
    sampleInfo.sampleCountEntries = sampleCountEntries; // in stsc
    sampleInfo.sampleSizeInfo = sampleSizeInfo; // in stsz

    sampleInfo.dtDeltaEntries = dtDeltaEntries;
    sampleInfo.ctOffsetEntries = ctOffsetEntries;

    sampleInfo.trackId = trackId;
    sampleInfo.handlerString = handlerString;
    sampleInfo.timeScale = timeScale;
    sampleInfo.keyframeNumberList = keyframeNumberList;

    sampleInfo.table = GetSampleTable(sampleInfo);

    return sampleInfo;
}


function newFileInfo(arrayBuffer)
{
    var obj = {};
    obj["pointer"] = 0;
    obj["dataView"] = new DataView(arrayBuffer);
    obj["beginOffset"] = 0;

    obj["read"] = function(length)
    {
        if(obj.pointer + length > obj.dataView.byteLength)
        {
            throw "Length out of range.";
        }

        var uint8Array = (new Uint8Array(obj.dataView.buffer)).slice(obj.pointer, obj.pointer+length);
        // must COPY the array
        obj.pointer += length;

        return uint8Array;
    };

    obj["readI"] = function()
    {
        var uint32 = obj.dataView.getUint32(obj.pointer);
        obj.pointer += 4;

        return uint32;
    };

    obj["readint"] = function()
    {
        var int32 = obj.dataView.getInt32(obj.pointer);
        obj.pointer += 4;

        return int32;
    };

    obj["readB"] = function()
    {
        var B = obj.dataView.getUint8(obj.pointer);
        obj.pointer += 1;

        return B;
    }

    return obj;
}

function concatArrays(first, second)
{
    var len1 = first.length;
    var len2 = second.length;

    var newArray = new Uint8Array(len1 + len2);
    newArray.set(first, 0);
    newArray.set(second, len1);

    return newArray;
}

function memcpy(dst, dstOffset, src, srcOffset, length)
{
    var dstU8 = new Uint8Array(dst, dstOffset, length);
    var srcU8 = new Uint8Array(src, srcOffset, length);
    dstU8.set(srcU8);
};

function getString(nameArray)
{
    var name = "";
    for(var i = 0; i < nameArray.length; i++)
    {
        name += String.fromCharCode(nameArray[i]);
    }
    return name;
}
