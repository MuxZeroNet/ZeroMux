function GetTrackId(sampleInfo)
{
    return sampleInfo.trackId;
}

function IsSampleSync(number, sampleInfo)
{
    var keyframeNumberList = sampleInfo.keyframeNumberList;
    if (keyframeNumberList == null)
    {
        return true;
    }
    else
    {
        return keyframeNumberList.includes(number);
    }
}



function FindIndexInCounts(array, countIndex, number)
{
    return FindIndexInCountsM(array, countIndex, number)[0];
}

function FindIndexInCountsM(array, countIndex, number, cachedIndex=0, cachedSum=1)
{
    var currentNumber = cachedSum;
    // currentNumber: absolute
    //for i in range(cachedIndex, len(array)):
    for(var i = cachedIndex; i < array.length; i++)
    {
        var item = array[i][countIndex];

        var nextNumber = currentNumber + item;
        // nextNumber: absolute
        if (number >= currentNumber && number < nextNumber)
        {
            return [i, currentNumber];
        }

        currentNumber = nextNumber;
    }

    throw "No results. params: number=" + number
        + ", cachedIndex=" + cachedIndex
        + ", cachedSum=" + cachedSum;

}

// fast functions

function GetMaxChunkNumber(sampleInfo)
{
    return sampleInfo.chunkOffsetList.length;
}


function GetChunkOffset(chunkNumber, sampleInfo)
{
    return sampleInfo.chunkOffsetList[chunkNumber - 1];
}

// slow functions

// returns [cache, sampleCount, descIndex]
function GetChunkInfo(chunkNumber, sampleInfo, startIndex=0)
{
    var sampleCountEntries = sampleInfo.sampleCountEntries;

    var maxChunkNumber = GetMaxChunkNumber(sampleInfo)
    if (chunkNumber > maxChunkNumber)
    {
        throw "chunkNumber out of range.";
    }


    //for i in range( startIndex, len(sampleCountEntries) ):
    for(var i = startIndex; i < sampleCountEntries.length; i++)
    {
        // firstChunk (abs. number), samplesPerChunk, descriptionIndex
        var currentEntry = sampleCountEntries[i];
        //nextEntry = sampleCountEntries[i+1] if i < len(sampleCountEntries)-1 \
        //       else (maxChunkNumber+1, None, None)

        var nextEntry = (i < sampleCountEntries.length - 1)
            ? sampleCountEntries[i+1] : [maxChunkNumber+1, null, null];

        var firstChunkNumber = currentEntry[0];
        var nextChunkNumber = nextEntry[0];

        if (chunkNumber >= firstChunkNumber && chunkNumber < nextChunkNumber)
        {
            return [i, currentEntry[1], currentEntry[2]];
        }

    }

    throw "chunk not found. chunkNumber=" + chunkNumber
        + ", startIndex=" + startIndex;
}

function GetChunkFirstSampleNumber(chunkNumber, sampleInfo)
{
    return GetChunkFirstSampleNumberM(chunkNumber, sampleInfo);
}


function GetChunkFirstSampleNumberM(chunkNumber, sampleInfo, startChunkNumber=1, prevSum=0)
{
    var result = 1 + prevSum;

    var startIndex = 0;
    //for number in range(startChunkNumber, chunkNumber):
    for(var number = startChunkNumber; number < chunkNumber; number++)
    {
        //startIndex, count, t = GetChunkInfo(number, sampleInfo, startIndex=startIndex)
        var abc = GetChunkInfo(number, sampleInfo, startIndex);
        startIndex = abc[0];
        var count = abc[1];

        result += count;
    }


    // result = 1 + sum([count for number in range(1, chunkNumber)])

    return result;
}

function GetChunkLength(chunkNumber, sampleInfo, smpCount=null, firstSampleNum=null)
{
    var chunkOffset = GetChunkOffset(chunkNumber, sampleInfo);

    var sampleCount = smpCount || GetChunkInfo(chunkNumber, sampleInfo)[1];

    var chunkFirstSampleNumber = firstSampleNum || GetChunkFirstSampleNumber(chunkNumber, sampleInfo);

    var nextChunkFirstSampleNumber = chunkFirstSampleNumber + sampleCount;
    // [first, next)

    //chunkLength = sum( [GetSampleSize(n, sampleInfo) \
    //    for n in range(chunkFirstSampleNumber, nextChunkFirstSampleNumber)] )
    var chunkLength = 0;
    for(var n = chunkFirstSampleNumber; n < nextChunkFirstSampleNumber; n++)
    {
        chunkLength += GetSampleSize(n, sampleInfo);
    }
    // add them up

    // Do NOT use GetChunkOffset(chunkNumber+1) !!!

    return chunkLength;

}

// fast function
function GetSampleSize(number, sampleInfo)
{
    //constantSampleSize, sampleSizeList = sampleInfo["offsetInfo"]["sampleSizeInfo"]
    var stsz = sampleInfo.sampleSizeInfo;
    var constSize = stsz[0];
    var sizeList = stsz[1];

    //sampleSize = constantSampleSize if constantSampleSize != 0 else sampleSizeList[number-1]
    var sampleSize = (constSize != 0) ? constSize : sizeList[number-1];

    return sampleSize;
}

function GetMaxSampleNumber(sampleInfo)
{
    return sampleInfo.sampleSizeInfo[1].length;
}



// slow functions
function GetSampleOffset(chunkNumber, relativeSampleNumber, sampleInfo)
{
    throw "GetSampleOffset is not implemened in JS version.";
}

// get the absolute time stamp of given sample
// returns [absolute decode time, ctOffset]
function GetSampleTimestamp(number, sampleInfo)
{
    var dtDeltaList = sampleInfo.dtDeltaEntries;
    var ctOffsetList = sampleInfo.ctOffsetEntries;

    if (number == 1)
    {
        var absoluteDt = 0;
        var ctOffset = null;

        if (ctOffsetList != null)
        {
            ctOffset = ctOffsetList[0][1];
        }
        else
        {
            ctOffset = 0;
        }
        return [absoluteDt, ctOffset]; // for the first sample
    }

    // absoluteDt = sum of duration of all prev samples

    var index = FindIndexInCounts(dtDeltaList, 0, number);

    // dtDeltaList:
    // [0]          [1]
    // sampleCount  sampleDelta

    // dtSum = sum( [dtDeltaEntries[i][0]*dtDeltaEntries[i][1] for i in range(index)] )
    // sum(duration of all prev samples)

    var dtSum = 0;
    for(var i = 0; i < index; i++)
    {
        dtSum += dtDeltaList[i][0] * dtDeltaList[i][1];
    }

    // startSampleNumber = 1 + sum( [dtDeltaEntries[i][0] for i in range(index)] )

    var startSampleNumber = 1;
    for(var i = 0; i < index; i++)
    {
        startSampleNumber += dtDeltaList[i][0];
    }

    var currentSampleCount = dtDeltaList[index][0];
    var currentSampleDuration = dtDeltaList[index][1];
    var nextStartSampleNumber = startSampleNumber + currentSampleCount;


    dtSum += (number - startSampleNumber) * currentSampleDuration;

    //ctts = ctOffsetEntries[FindIndexInCounts(ctOffsetEntries, 0, number)][1] \
    //    if ctOffsetEntries != None \
    //    else 0

    var ctts = (ctOffsetList != null)
        ? ctOffsetList[FindIndexInCounts(ctOffsetList, 0, number)][1]
        : 0;

    return [dtSum, ctts];
}



function FirstChunkAfterOffset(offset, sampleInfo)
{
    var offsetList = sampleInfo.chunkOffsetList;

    if (offset >= offsetList[offsetList.length - 1])
    {
        throw "No results. Given offset is >= maximum offset.";
    }

    if (offset < offsetList[0])
    {
        return 1; // We need "number" (not offset)
    }

    // make sure `target` is WITHIN the bounds of `table`
    var nearestLowerBound = ChunkBinarySearch(offsetList, offset);
    var chunkIndexAfter = nearestLowerBound + 1;
    var chunkNumberAfter = chunkIndexAfter + 1;

    return chunkNumberAfter;
}

function FirstChunkBeforeOffset(offset, sampleInfo)
{
    var offsetList = sampleInfo.chunkOffsetList;

    if (offset <= offsetList[0])
    {
        console.warn("No results. Given offset is <= min offset.");
        return -1;
    }

    if (offset > offsetList[offsetList.length - 1])
    {
        return offsetList.length; // We need "number"
    }

    //nearestUpperBound = ChunkBinarySearch(offsetList, offset, retLower=False)
    var nearestUpperBound = ChunkBinarySearch(offsetList, offset, 0, null, false);
    var chunkIndexBefore = nearestUpperBound - 1;
    var chunkNumberBefore = chunkIndexBefore + 1;

    return chunkNumberBefore;
}




// make sure `target` is WITHIN the bounds of `table`
// when target is not found, return the nearest lowerBound or upperBound
function ChunkBinarySearch(table, target, low=0, up=null, retLower=true)
{
    var lowerBound = low
    var upperBound = up || table.length - 1;

    if (table[lowerBound] == target)
    {
        return lowerBound;
    }


    if (table[upperBound] == target)
    {
        return upperBound;
    }



    if (lowerBound + 1 == upperBound)
    {
        // not found
        if (retLower)
        {
            return lowerBound;
        }
        else
        {
            return upperBound;
        }
    }



    var half = lowerBound + (upperBound - lowerBound) / 2;
    half = half | 0; /* "//" 2 */

    if (table[half] == target)
    {
        return half;
    }

    else if (table[half] < target)
    {
        // lower = half
        //return ChunkBinarySearch(table, target, retLower=retLower, low=half, up=upperBound);
        return ChunkBinarySearch(table, target, half, upperBound, retLower);
    }

    else if (table[half] > target)
    {
        // upper = half
        //return ChunkBinarySearch(table, target, retLower=retLower, low=lowerBound, up=half);
        return ChunkBinarySearch(table, target, lowerBound, half, retLower);
    }

}



// make sure `target` is WITHIN the bounds of `table`
// when target is not found, return the nearest lowerBound or upperBound
function TableBinarySearch(table, target, select=0, low=0, up=null, retLower=true)
{
    var lowerBound = low;
    var upperBound = up || table.length - 1;

    if (table[lowerBound][select] == target)
    {
        return lowerBound;
    }

    if (table[upperBound][select] == target)
    {
        return upperBound;
    }

    if (lowerBound + 1 == upperBound)
    {
        // not found
        if (retLower)
        {
            return lowerBound;
        }
        else
        {
            return upperBound;
        }
    }

    var half = lowerBound + (upperBound - lowerBound) / 2;
    half = half | 0; /* "//" 2 */

    if (table[half][select] == target)
    {
        return half;
    }

    else if (table[half][select] < target)
    {
        // lower <- half
        return TableBinarySearch(table, target, select, half, upperBound, retLower);
    }

    else if (table[half][select] > target)
    {
        // upper <- half
        return TableBinarySearch(table, target, select, lowerBound, half, retLower);
    }

}