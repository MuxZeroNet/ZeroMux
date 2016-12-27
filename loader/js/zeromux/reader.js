function readFileJson(jsonContent)
{
    var jsonObject = JSON.parse(jsonContent);
    
    var bigFileInfo = readBigFileInfo(jsonObject["bigFile"]);
    var fileParts = readFilePartArray(jsonObject["fileParts"]);
    
    checkBoth(bigFileInfo, fileParts);
    
    return [bigFileInfo, fileParts];
}

function readBigFileInfo(bigFileObject)
{
    var bigFileInfo = {};
    
    bigFileInfo["fileName"] = String(bigFileObject["fileName"]);
    
    bigFileInfo["size"] = parseInt(bigFileObject["size"]);
    
    bigFileInfo["hashingAlgorithm"] = bigFileObject["hashingAlgorithm"].toLowerCase();
    bigFileInfo["hash"] = bigFileObject["hash"].toLowerCase();
    
    checkBigFileInfo(bigFileInfo);
    
    return bigFileInfo;
}

function readFilePartArray(filePartArray)
{
    assert(filePartArray instanceof Array, "filePart ???");
    
    var fileParts = [];
    
    for(var item of filePartArray)
    {
        var filePartInfo = {};
        
        filePartInfo["path"] = String(item["path"]);
        
        filePartInfo["order"] = parseInt(item["order"]);
        filePartInfo["size"] = parseInt(item["size"]);
        
        filePartInfo["hashingAlgorithm"] = item["hashingAlgorithm"].toLowerCase();
        filePartInfo["hash"] = item["hash"].toLowerCase();
        
        checkFilePartInfo(filePartInfo);
        fileParts.push(filePartInfo);
    }
    fileParts = fileParts.sort((a, b) => a["order"] - b["order"]);
    return fileParts;
}

function checkBigFileInfo(info)
{   
    assert(info["fileName"] != undefined && info["fileName"].trim() != "",
           "BigFile: needs a name");
    
    assert(info["size"] >= 0, "BigFile: size " + info["size"]);
    
    assert(isHashSafe(info["hashingAlgorithm"], info["hash"]), "BigFile: unsafe hash");
}

function checkFilePartInfo(info)
{
    assert(info["path"] != undefined && info["path"] != "", "FilePart: path is empty");
    
    assert(info["order"] >= 0, "FilePart: order " + info["order"]);
    assert(info["size"] >= 0, "FilePart: size " + info["size"]);
    
    assert(isHashSafe(info["hashingAlgorithm"], info["hash"]), "FilePart: unsafe hash");
}

function isHashSafe(hashingAlgorithm, hash)
{
    safeHashes = ["sha512", "sha256"];
    
    assert(safeHashes.indexOf(hashingAlgorithm) >= 0,
           "unsupported hash " + hashingAlgorithm);
    
    switch(hashingAlgorithm)
    {
        case "sha512":
            assert(/^[0-9a-z]{128}$/g.test(hash),
                   "invalid sha512 hash value " + hash);
            break;
        
        case "sha256":
            assert(/^[0-9a-z]{64}$/g.test(hash),
                   "invalid sha256 hash value " + hash);
            break;
        
        default:
            assert(false, "WTF hashing algorithm")
            break;
    }
    
    return true;
}

function checkBoth(bigFileInfo, parts)
{
    var fileSize1 = bigFileInfo["size"];
    var fileSize2 = sum(parts.map(item => item["size"]));
    
    assert(fileSize1 == fileSize2, "file sizes mismatch.");
    
    var previousOrder = -1;
    for(var index = 0; index < parts.length; index++)
    {
        if (previousOrder >= parts[index]["order"])
        {
            throw "Order Error!";
        }
    }
}


function assert(condition, errorMessage)
{
    console.assert(condition, errorMessage)
    if(!condition)
    {
        throw "Assert Failed";
    }
}

