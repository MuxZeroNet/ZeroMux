function sum(array)
{
    return array.reduce((curr, prev) => curr + prev);
}

function assert(condition, errorMessage)
{
    console.assert(condition, errorMessage)
    if(!condition)
    {
        throw "Assert Failed";
    }
}

function getEmptySlot(array, suggestion=0)
{
    //prefer empty slots at the beginning
    
    var startIndex = Math.max(
        Math.min(parseInt(
            array.length - Math.random()*array.length*2.2
        ), array.length),
    0);
    
    startIndex = startIndex + suggestion;
    
    for(var counter = 0; counter < array.length; counter++)
    {
        var index = (counter + startIndex) % array.length;
        if(array[index] == null)
        {
            return index;
        }
    }
    
    return -1;
}


function simplerWorker(jsPath, callback)
{
    // bypassing ZeroNet's sandboxed iframe error
    
    success = function(xmlHttp)
    {
        var arrayBuffer = xmlHttp.response;
        var blob = new Blob([arrayBuffer]);
        var blobUrl = window.URL.createObjectURL(blob);
        
        var myWorker = new Worker(blobUrl);
        
        callback(myWorker);
    };
    
    failure = function(xmlHttp, reason)
    {
        console.error("Worker failed to start: cannot get js");
    };
    
    
    requestBinary(jsPath, "arraybuffer", success, failure);
}


function lastInFirstSequence(array)
{
    for(var i = 0; i < array.length - 1; i++)
    {
        if(array[i] == null)
        {
            return i - 1;
        }
        else if(array[i+1] == null)
        {
            return i;
        }
    }
    
    return array.length - 1;
}

function getScriptFolder(myName)
{
    var scripts = document.getElementsByTagName('script');
    var scriptFolder = [];
    for(var scriptElement of scripts)
    {
        var scriptPath = scriptElement.src.split('?')[0];

        var names = scriptPath.split('/');
        var scriptName = names.pop();

        if(scriptName == myName)
        {
            scriptFolder = names;
            break;
        }
    }
    
    return scriptFolder;
}

function getAbsoluteUrls(jsUrls)
{
    var absJsUrls = jsUrls.map(function(relUrl)
    {
        var a = document.createElement("a");
        a.href = relUrl;

        var result = a.href;
        return result;
    });
    
    return absJsUrls;
}

function nop(eventArgs)
{
    return;
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

function requestText(url, minetype, callback, failure)
{
    requestAsync(url, minetype, null, callback, failure)
}

function requestBinary(url, responseType, callback, failure)
{
    requestAsync(url, null, responseType, callback, failure)
}

function unbind(element)
{
    element.parentNode.replaceChild(element.cloneNode(true), element);
}