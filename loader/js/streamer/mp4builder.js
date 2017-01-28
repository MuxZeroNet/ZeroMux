function packString(s)
{
    var bytes = new Uint8Array(s.length);

    for(var i = 0; i < s.length; i++)
    {
        bytes[i] = s.charCodeAt(i);
    }
    return bytes;
}

function CalcNewBoxSize(content, fullBox=false)
{
    return content.length + 8 + (fullBox ? 4 : 0);
}

function PackBox(boxInfo, fullBox=false)
{
    if (boxInfo["size"] < 4)
    {
        throw "Box size not implemented";
    }

    if (boxInfo["type"] == "uuid")
    {
        throw "uuid box not implemented";
    }

    var boxSize = CalcNewBoxSize(boxInfo["content"], fullBox);
    var boxBytes = new Uint8Array(boxSize);

    //header = struct.pack(">I4s", boxInfo["size"], boxInfo["type"]);

    // pack header
    var dataView = new DataView(boxBytes.buffer);

    dataView.setUint32(0, boxInfo["size"]); // +4
    var nameBytes = packString(boxInfo["type"]);
    boxBytes.set(nameBytes, 4); // +4

    var offset = 8;

    if (fullBox)
    {
        //version_flags = struct.pack(">B3s", boxInfo["version"], boxInfo["flags"])
        //return header + version_flags + boxInfo["content"]

        // pack version & flags
        dataView.setUint8(8, boxInfo["version"]); // +1
        var flagBytes = packString(boxInfo["flags"]);

        boxBytes.set(flagBytes, 9); // +3

        offset = 12;
    }
    else
    {
        //return header + boxInfo["content"]
        offset = 8;
    }

    boxBytes.set(boxInfo["content"], offset);

    return boxBytes;

}


// metadata

function BuildNewMvexBox(duration, trackIdList, descIndexList)
{
    var mehdBox = BuildNewMehdBox(duration);

    var mvexContent = PackBox(mehdBox, true); // add mvhd box

    //for i in range(len(trackIdList)):
    for(var i = 0; i < trackIdList.length; i++)
    {
        var trackId = trackIdList[i];
        var descIndex = descIndexList[i];

        var trexBytes = PackBox(BuildNewTrexBox(trackId, descIndex), true);

        mvexContent = concatArrays(mvexContent, trexBytes);
        // mvexContent += trexBytes
    }


    var newMvexBox = {
        "content": mvexContent,
        "size": CalcNewBoxSize(mvexContent), // "folder" box
        "type": "mvex",
    };

    return newMvexBox; // "folder" box
}

function BuildNewMehdBox(duration)
{
    //duration64str = struct.pack(">Q", duration)
    if (!Number.isSafeInteger(duration))
    {
        throw "mehd box: duration is too big (unsafe int)";
    }
    if (duration > 0xFFFFFFFF)
    {
        throw "mehd box: duration is too big (more than 32 bits)";
    }

    var duration64str = new Uint8Array(8);
    var dataView = new DataView(duration64str.buffer);
    dataView.setUint32(4, duration);

    var newMehdBox = {
        "content": duration64str,
        "size": CalcNewBoxSize(duration64str, true),
        "type": "mehd",

        "version": 1,
        "flags": "\x00\x00\x00",
    };

    return newMehdBox; // version=1
}

function BuildNewTrexBox(trackId, descIndex)
{
    //trackIdStr_descIndexStr = struct.pack(">II", trackId, descIndex)
    //otherFields = "\x00" * 12

    //trexContent = trackIdStr_descIndexStr + otherFields

    var trexContent = new Uint8Array(8 + 12);
    var dataView = new DataView(trexContent.buffer);
    dataView.setUint32(0, trackId);
    dataView.setUint32(4, descIndex);

    var newTrexBox = {
        "content": trexContent,
        "size": CalcNewBoxSize(trexContent, true),
        "type": "trex",

        "version": 0,
        "flags": "\x00\x00\x00",
    };

    return newTrexBox;
}

function BuildNewStblBox(stsdBox)
{
    //content = "\x00\x00\x00\x00"
    var content = new Uint8Array(4);
    var empty8 = new Uint8Array(8);

    var size = CalcNewBoxSize(content, true);

    var newStszBox = {
        "content": empty8, // sample_size sample_count
        "size": size+4,
        "type": "stsz",
        "version": 0,
        "flags": "\x00\x00\x00",
    };

    var newStscBox = {
        "content": content,
        "size": size,
        "type": "stsc",
        "version": 0,
        "flags": "\x00\x00\x00",
    };

    var newSttsBox = {
        "content": content,
        "size": size,
        "type": "stts",
        "version": 0,
        "flags": "\x00\x00\x00",
    };

    var newStcoBox = {
        "content": content,
        "size": size,
        "type": "stco",
        "version": 0,
        "flags": "\x00\x00\x00",
    };

    //stblContent = PackBox(stsdBox, True) + \
    //    PackBox(newStszBox, True) + PackBox(newStscBox, True) + \
    //    PackBox(newSttsBox, True) + PackBox(newStcoBox, True)
    var stblContent = concatArrays( PackBox(stsdBox, true), PackBox(newStszBox, true) ); // #1~#2
    stblContent = concatArrays( stblContent, PackBox(newStscBox, true) ); // #3
    stblContent = concatArrays( stblContent, PackBox(newSttsBox, true) ); // #4
    stblContent = concatArrays( stblContent, PackBox(newStcoBox, true) ); // #5

    var newStblBox = {
        "content": stblContent,
        "size": CalcNewBoxSize(stblContent),
        "type": "stbl",
    };

    return newStblBox;
}

function BuildNewMinfBox(vmhdBox, dinfBox, stblBox)
{
    var minfContent = PackBox(vmhdBox, true);
    if (dinfBox != null)
    {
        //minfContent += PackBox(dinfBox); // dinf "folder"
        minfContent = concatArrays(minfContent, PackBox(dinfBox));
    }

    //minfContent += PackBox(stblBox); // "folder"
    minfContent = concatArrays(minfContent, PackBox(stblBox));

    var newMinfBox = {
        "content": minfContent,
        "size": CalcNewBoxSize(minfContent),
        "type": "minf",
    };

    return newMinfBox; // "folder"
}

function BuildNewMdiaBox(mdhdBox, hdlrBox, minfBox)
{
    //mdiaContent = PackBox(mdhdBox, fullBox=True) + \
    //    PackBox(hdlrBox, fullBox=True) + \
    //    PackBox(minfBox) // "folder"

    var mdiaContent = concatArrays( PackBox(mdhdBox, true), PackBox(hdlrBox, true) );
    mdiaContent = concatArrays( mdiaContent, PackBox(minfBox) );

    var newMdiaBox = {
        "content": mdiaContent,
        "size": CalcNewBoxSize(mdiaContent),
        "type": "mdia",
    };

    return newMdiaBox; // "folder"
}

function BuildNewTrakBox(tkhdBox, edtsBox, mdiaBox)
{
    var trakContent = PackBox(tkhdBox, true);

    if (edtsBox != null)
    {
        //trakContent += PackBox(edtsBox); // "folder"
        trakContent = concatArrays(trakContent, PackBox(edtsBox));
    }


    //trakContent += PackBox(mdiaBox); // "folder"
    trakContent = concatArrays(trakContent, PackBox(mdiaBox));

    var newTrakBox = {
        "content": trakContent,
        "size": CalcNewBoxSize(trakContent),
        "type": "trak",
    };

    return newTrakBox; // "folder"
}

function BuildNewMoovBox(mvhdBox, trakBoxList, mvexBox)
{
    var moovContent = PackBox(mvhdBox, true);
    //for trakBox in trakBoxList:
    for (trakBox of trakBoxList)
    {
        //moovContent += PackBox(trakBox); // "folder" box
        moovContent = concatArrays(moovContent, PackBox(trakBox));
    }

    //moovContent += PackBox(mvexBox); // "folder" box
    moovContent = concatArrays(moovContent, PackBox(mvexBox));

    var newMoovBox = {
        "content": moovContent,
        "size": CalcNewBoxSize(moovContent),
        "type": "moov",
    };

    return newMoovBox; // "folder"
}

function MakeNewTrak(trakBox)
{
    var tkhdBox = FindBox("tkhd", trakBox, true)[0];
    var edtsBox = FindBox("edts", trakBox)[0];

    var mdiaBox = FindBox("mdia", trakBox)[0];
    var mdhdBox = FindBox("mdhd", mdiaBox, true)[0];
    var hdlrBox = FindBox("hdlr", mdiaBox, true)[0];

    var minfBox = FindBox("minf", mdiaBox)[0];
    var vmhdBox = FindBox("vmhd", minfBox, true)[0];
    var smhdBox = FindBox("smhd", minfBox, true)[0];

    vmhdBox = vmhdBox || smhdBox;

    var dinfBox = FindBox("dinf", minfBox)[0];

    var stblBox = FindBox("stbl", minfBox)[0];
    var stsdBox = FindBox("stsd", stblBox, true)[0];

    var newStblBox = BuildNewStblBox(stsdBox);
    var newMinfBox = BuildNewMinfBox(vmhdBox, dinfBox, newStblBox); // NEW!!! stbl box
    var newMdiaBox = BuildNewMdiaBox(mdhdBox, hdlrBox, newMinfBox); // NEW!!! minf box
    var newTrakBox = BuildNewTrakBox(tkhdBox, edtsBox, newMdiaBox); // NEW!!! mdia box

    return newTrakBox;
}


// fragments

function BuildNewMfhdBox(sequenceNumber)
{
    //content = struct.pack(">I", sequenceNumber);
    var content = new Uint8Array(4);
    var dataView = new DataView(content.buffer);
    dataView.setUint32(0, sequenceNumber);

    var newMfhdBox = {
        "content": content,
        "size": CalcNewBoxSize(content, true),
        "type": "mfhd",

        "version": 0,
        "flags": "\x00\x00\x00",
    };

    return newMfhdBox;
}

function BuildNewMdatBox(content)
{
    var newMdatBox = {
        "content": content,
        "size": CalcNewBoxSize(content),
        "type": "mdat",
    };

    return newMdatBox;
}

function BuildNewTfhdBox(trackId, handler)
{
    //headerFlags = "\x02\x00\x20" if handler == "vide" \
    //         else "\x02\x00\x00";
    // DefaultBaseIsMoof DefaultSampleFlagsPresent

    var headerFlags = (handler == "vide") ? "\x02\x00\x20" : "\x02\x00\x00";

    //content = struct.pack(">I", trackId); // add Track ID
    var content = new Uint8Array(4);
    var dataView = new DataView(content.buffer);
    dataView.setUint32(0, trackId);

    if (handler == "vide")
    {
        // add Default Sample flags
        //content += "\x01\x01\x00\x00"; // "non I frame" flags
        content = concatArrays(content, packString("\x01\x01\x00\x00"));
    }

    var newTfhdBox = {
        "content": content,
        "size": CalcNewBoxSize(content, true),
        "type": "tfhd",

        "version": 0,
        "flags": headerFlags,
    };

    return newTfhdBox;
}

function BuildNewTfdtBox(firstSampleDt)
{
    if (!Number.isSafeInteger(firstSampleDt))
    {
        throw "BuildTfdt: timestamp too large";
    }
    if (firstSampleDt > 0xFFFFFFFF)
    {
        throw "BuildTfdt: timestamp too large";
    }


    //dt64str = struct.pack(">Q", firstSampleDt);
    var dt64str = new Uint8Array(8);
    var dataView = new DataView(dt64str.buffer);
    dataView.setUint32(4, firstSampleDt);

    var newTfdtBox = {
        "content": dt64str,
        "size": CalcNewBoxSize(dt64str, true),
        "type": "tfdt",

        "version": 1,
        "flags": "\x00\x00\x00",
    };

    return newTfdtBox;
}

function BuildNewTrunBox(fromFrame, toFrame, handler, sampleInfo)
{
    var headerFlags = DecideTrunHeaderFlags(handler);

    var entries = GetSampleEntries(fromFrame, toFrame, handler, sampleInfo);
    // We don't need all of the fields in each entry, however.
    var count = entries.length;
    var relativeDataOffset = CalcDataOffset(count, handler);



    //content = struct.pack(">Ii", count, relativeDataOffset)
    var content = new Uint8Array(8);
    var dataView = new DataView(content.buffer);
    dataView.setUint32(0, count);
    dataView.setInt32(4, relativeDataOffset);

    if (handler == "vide")
    {
        var firstSampleFlags = DecideSampleFlags(true, handler); // if audio, ignore

        //content += struct.pack(">I", firstSampleFlags)
        var fsfBytes = new Uint8Array(4);
        var fsfDataView = new DataView(fsfBytes.buffer);
        fsfDataView.setUint32(0, firstSampleFlags);

        content = concatArrays(content, fsfBytes);
    }


    for (entry of entries)
    {
        //duration, size, ctts = entry;
        var dsc = entry;
        var duration = entry[0];
        var size = entry[1];
        var ctts = entry[2];

        if (handler == "vide")
        {
            //content += struct.pack(">III", duration, size, ctts)
            var dscBytes = new Uint8Array(12);
            var dscDataView = new DataView(dscBytes.buffer);
            dscDataView.setUint32(0, duration);
            dscDataView.setUint32(4, size);
            dscDataView.setUint32(8, ctts);

            content = concatArrays(content, dscBytes);
        }
        else
        {
            //content += struct.pack(">II", duration, size)
            var dsBytes = new Uint8Array(8);
            var dsDataView = new DataView(dsBytes.buffer);
            dsDataView.setUint32(0, duration);
            dsDataView.setUint32(4, size);

            content = concatArrays(content, dsBytes);
        }
    }

    var newTfdtBox = {
        "content": content,
        "size": CalcNewBoxSize(content, true),
        "type": "trun",

        "version": 0,
        "flags": headerFlags,
    };

    return newTfdtBox;

}

function ExtractTrunEntries(chunkNumber, handler, sampleInfo)
{
    throw "Not implemented.";
}

function CalcTrunSize(entryCount, handler)
{
    var x = 4 + 4; // sample_count + data_offset
    if (handler == "vide")
    {
        x += 4 + entryCount * (4 + 4 + 4);
        // first_sample_flags
        // duration + size + C.T.offset
    }
    else
    {
        x += entryCount * (4 + 4);
        // duration + size
    }

    return x;
}

function CalcDataOffset(entryCount, handler)
{
    // moof_header + mfhd_header + mfhd_content

    // traf_header + tfhd_header + tfhd_content

    // tfdt_header + tfdt_content

    // trun_header + trun_content

    // mdat_header

    var dataOffset =
        8 + 12 + 4 +
        8 + 12 + 4 + ( (handler == "vide") ? 4 : 0) +
        12 + 8 +
        12 + CalcTrunSize(entryCount, handler) +
        8;

    return dataOffset;
}

function DecideSampleFlags(isSync, handler)
{
    // trun sample flags
    if (handler != "vide")
    {
        return 0;
    }

    if (isSync)
    {
        return 0x02000000; // 4 bytes. depends_on=2
    }
    else
    {
        console.log("Decide sample flags: A non key frame!");
        return 0x01010000; // 4 bytes. non_sync=1, depends_on=1
    }
}

function DecideTrunHeaderFlags(handler)
{
    // trun header flags

    /*
    flags = DataOffsetPresent | SampleDurationPresent | SampleSizePresent;
    if handler == "vide":
        flags = flags | FirstSampleFlagsPresent | SampleCtOffsetPresent;

    return struct.pack(">I", flags)[1:4];
    */

    if (handler == "vide")
    {
        return "\x00\x0b\x05";
    }
    else
    {
        return "\x00\x03\x01";
    }
}

// fragmentation -- building moof box

function BuildNewTrafBox(tfhdBox, tfdtBox, trunBox)
{
    //content = PackBox(tfhdBox, fullBox=True) + \
    //    PackBox(tfdtBox, fullBox=True) + \
    //    PackBox(trunBox, fullBox=True);

    var content = concatArrays( PackBox(tfhdBox, true), PackBox(tfdtBox, true) );
    content = concatArrays(content, PackBox(trunBox, true));

    var newTrafBox = {
        "content": content,
        "size": CalcNewBoxSize(content),
        "type": "traf",
    };

    return newTrafBox; // "folder" box
}

function BuildNewMoofBox(mfhdBox, trafBox)
{
    //content = PackBox(mfhdBox, fullBox=True) + \
    //    PackBox(trafBox);

    var content = concatArrays( PackBox(mfhdBox, true), PackBox(trafBox) );

    var newMoofBox = {
        "content": content,
        "size": CalcNewBoxSize(content),
        "type": "moof",
    };

    return newMoofBox; // "folder" box
}

function MakeNewMoof(trackId, handler, fromFrame, toFrame, sampleInfo, seqNumber)
{
    //firstSampleDt, ctOffset = GetSampleTimestamp(fromFrame, sampleInfo);
    var f_c = GetSampleTimestamp(fromFrame, sampleInfo);
    var firstSampleDt = f_c[0];
    var ctOffset = f_c[1];

    var newTfhdBox = BuildNewTfhdBox(trackId, handler);
    var newTfdtBox = BuildNewTfdtBox(firstSampleDt);
    var newTrunBox = BuildNewTrunBox(fromFrame, toFrame, handler, sampleInfo); // !!!!!

    var newTrafBox = BuildNewTrafBox(newTfhdBox, newTfdtBox, newTrunBox);
    var newMfhdBox = BuildNewMfhdBox(seqNumber);

    var newMoofBox = BuildNewMoofBox(newMfhdBox, newTrafBox);

    return newMoofBox;
}

function GetSampleEntries(fromFrame, toFrame, handler, sampleInfo)
{
    var dtDeltaEntries = sampleInfo.dtDeltaEntries;
    var ctOffsetEntries = sampleInfo.ctOffsetEntries;

    var entries = [];

    var indexDt = 0;
    var cachedSumDt = 1;
    var indexCt = 0;
    var cachedSumCt = 1;
    //FindIndexInCountsM(array, countIndex, number, cachedIndex=0, cachedSum=1)

    //for sampleNumber in range(fromFrame, toFrame+1):
    for(var sampleNumber = fromFrame; sampleNumber < toFrame+1; sampleNumber++)
    {
        // get duration, save cache
        //indexDt, cachedSumDt = FindIndexInCountsM(dtDeltaEntries, 0, sampleNumber, indexDt, cachedSumDt);
        var ic = FindIndexInCountsM(dtDeltaEntries, 0, sampleNumber, indexDt, cachedSumDt);
        indexDt = ic[0];
        cachedSumDt = ic[1];

        var duration = dtDeltaEntries[indexDt][1];

        // fast function: stsz
        var sampleSize = GetSampleSize(sampleNumber, sampleInfo);

        // get C.T. offset value, if video
        var ctOffset = 0;
        if (ctOffsetEntries != null && handler == "vide")
        {
            // save cache, get c.t. offset
            //indexCt, cachedSumCt = FindIndexInCountsM(ctOffsetEntries, 0, sampleNumber, indexCt, cachedSumCt);
            var icc = FindIndexInCountsM(ctOffsetEntries, 0, sampleNumber, indexCt, cachedSumCt);
            indexCt = icc[0];
            cachedSumCt = icc[1];

            ctOffset = ctOffsetEntries[indexCt][1];
        }

        entries.push( [duration, sampleSize, ctOffset] );
    }

    return entries;

}

function ReadRaw(chunkOffset, chunkSize, fileStream)
{
    var beginOffset = fileStream.beginOffset;

    fileStream.pointer = chunkOffset - beginOffset; // seek

    if(fileStream.pointer + chunkSize > fileStream.dataView.byteLength)
    {
        // out of range
        console.warn("ReadRaw Warning: no enough data");
        return null;
    }

    var chunkContent = fileStream.read(chunkSize);
    return chunkContent;
}

function GetFrameData(from_Frame, to_Frame, sampleInfo, fileStream)
{
    // (chunk number, chunk size, first sample, sample count)
    var data = new Uint8Array(0);
    var startFrame = from_Frame;

    while (startFrame <= to_Frame)
    {
        var item = FindItemInTable(startFrame, sampleInfo.table);

        //chunkNumber, chunkSize, firstSample, sampleCount = sampleTableItem;
        var chunkNumber = item[0];
        var chunkSize   = item[1];
        var firstSample = item[2];
        var sampleCount = item[3];

        var chunkOffset = GetChunkOffset(chunkNumber, sampleInfo);
        // know where the chunk is

        var sampleBound = firstSample + sampleCount;
        // [firstSample, sampleBound)


        var add = 0
        var rightBound = chunkOffset + chunkSize;
        // left offset, right bound

        var framesToRead = sampleCount;
        // now calculate the left bound
        if (firstSample < startFrame)
        {
            // startFrame offset != chunkOffset, skip a few samples
            var framesToSkip = startFrame - firstSample;

            add = GetChunkLength(chunkNumber, sampleInfo, framesToSkip, firstSample);
            framesToRead = sampleCount - framesToSkip;
        }

        else if (firstSample == startFrame)
        {
            // startFrame offset == chunkOffset
            add = 0;
            framesToRead = sampleCount;
        }
        else
        {
            throw "We haven't reached that chunk.";
        }

        // now calculate the right bound
        if (to_Frame < sampleBound)
        {
            // toFrame is within this chunk -- we are reaching the end
            var partialChunkSize = GetChunkLength(chunkNumber, sampleInfo,
                to_Frame+1 - firstSample, firstSample)
            // In GetChunkLength:
            //      sampleBound = firstSample + count
            //   => count = sampleBound - firstSample
            //   => count = (to_Frame+1) - firstSample

            rightBound = chunkOffset + partialChunkSize;

            // STOP the loop
            startFrame = to_Frame + 1;
        }
        else
        {
            // read the whole chunk
            rightBound = chunkOffset + chunkSize;
        }

        var leftBound = chunkOffset + add;
        var remainingSize = rightBound - leftBound;


        //assert(leftBound >= chunkOffset);
        //assert(rightBound <= chunkOffset + chunkSize);
        //assert(remainingSize <= chunkSize);

        //data += ReadRaw(leftBound, remainingSize, fileStream);
        var dataToAppend = ReadRaw(leftBound, remainingSize, fileStream);
        if (dataToAppend == null)
        {
            // no enough data
            return null;
        }
        else
        {
            data = concatArrays(data, dataToAppend);
        }

        // how many samples did it read?
        startFrame += framesToRead;
    }

    return data;
}

function FindItemInTable(fromFrame, sampleTable)
{
    // fromFrame: sample number
    // (chunk number, chunk size, first sample, sample count)
    for (item of sampleTable)
    {
        if (item[2] <= fromFrame && fromFrame < item[2] + item[3])
        {
            return item;
        }
    }

}
