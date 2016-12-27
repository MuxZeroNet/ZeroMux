function convert(algorithmString)
{
    switch(algorithmString)
    {
        case "sha512":
            return asmCrypto.SHA512.hex;
        
        case "sha256":
            return asmCrypto.SHA256.hex;
        
        default:
            throw "Unsupported hashing algorithm.";
    }
}

onmessage = function(e)
{
    //importScripts('js/asmcrypto.js');
    importScripts(URL.createObjectURL(e.data[2]));
    
    hashingAlgorithm = e.data[0];
    // e.data[1] contains the contents of blob as a typed array
    bytes = e.data[1];
    
    var algorithm = convert(hashingAlgorithm);
    var actualHash = algorithm(bytes);

    console.log("Web worker is returning the result.");
    postMessage(actualHash);
}