
function dealWithFailure(reason)
{
    console.error(reason);
}

function getToken(callback, failure)
{
    readStatusResp("/getToken?" + dummyQueries(),
    function(jsonResp)
    {
        callback(encodeURIComponent(jsonResp["token"]));

    }, failure);
}

function attachToken(element, callback, failure)
{
    getToken(function(token)
    {
        element.setAttribute("data-token", token);
        callback(token);
    },failure);
}

function popAttachedToken(element)
{
    var token = peekAttachedToken(element);
    if(token.length > 0)
    {
        element.removeAttribute("data-token");
    }
    return token;
}

function peekAttachedToken(element)
{
    if(element.hasAttribute("data-token"))
    {
        var token = element.getAttribute("data-token");
        return token;
    }

    return "";
}

function readStatusResp(url, callback, failure)
{
    requestText(url, "application/json",
    function(xmlHttp)
    {
        var respText = xmlHttp.responseText;

        try
        {
            var jsonResp = JSON.parse(respText);
        }
        catch(e)
        {
            failure(respText);
            return;
        }

        if(!jsonResp.hasOwnProperty("status"))
        {
            failure(respText);
            return;
        }

        if(jsonResp["status"] != true)
        {
            failure(jsonResp);
            return;
        }
        else
        {
            callback(jsonResp);
        }
    },
    function(xmlHttp, reason)
    {
        failure(reason.message);
    });
}

function chooseFile(toVirtualDir, token, callback, failure)
{
    var url = "/chooseFile?token=" + token +
        "&path=" + encodeURIComponent(toVirtualDir) +
        "&" + dummyQueries();


    var onFailed = function(why, retry=10)
    {
        if(retry <= 0)
        {
            failure("Time out!");
            return;
        }

        console.error(why);

        if(isDict(why) && why.hasOwnProperty("status") && why["status"] == false)
        {
            failure(why["message"]);
            return;
        }

        setTimeout(function()
        {
            showSelectedFile(function(filePath)
            {
                callback({"tried": 10-retry, "filePath": filePath});
            },
            function()
            {
                onFailed(retry - 1);
            });

        }, 500);
    };


    readStatusResp(url, callback, function(e){ onFailed(e); });
}

function confirmUpload(rename, token, callback, failure)
{
    var url = "/confirmUpload?token=" + token +
        "&rename=" + encodeURIComponent(rename) +
        "&" + dummyQueries();

    var onFailed = function(why, retry=60)
    {
        console.log(retry);

        if(retry <= 0)
        {
            failure("Time out.");
            return;
        }

        console.error(why);

        if(isDict(why) && why.hasOwnProperty("status") && why["status"] == false)
        {
            failure(why["message"]);
            return;
        }

        var reportUrl = "/showUploaded?" + dummyQueries();
        setTimeout(function()
        {
            readStatusResp(reportUrl, function(jsonResp)
            {
                var dict = jsonResp["message"];
                if(dict.hasOwnProperty(token))
                {
                    callback(dict[token]);
                }
                else
                {
                    onFailed(retry - 10);
                }

            },
            function()
            {
                onFailed(retry - 1);
            });

        }, 1000);
    };

    readStatusResp(url, function(jsonResp)
    {
        callback(jsonResp["message"]);
    },
    function(e)
    {
        onFailed(e);
    });
}

function showSelectedFile(callback, failure)
{
    var url = "/showSelected?" + dummyQueries();

    readStatusResp(url, function(jsonResp)
    {
        if(jsonResp["detail"] != "selected")
        {
            callback("");
        }
        else
        {
            callback(jsonResp["filePath"]);
        }
    }, failure)
}

function newFolder(inDir, name, token, callback, failure)
{
    var url = "/newFolder?token=" + token +
        "&in=" + encodeURIComponent(inDir) +
        "&name=" + encodeURIComponent(name) +
        "&" + dummyQueries();

    readStatusResp(url, function(jsonResp)
    {
        callback(jsonResp["message"]);
    }, failure);
}

function rename(itemType, path, newName, token, callback, failure)
{
    var url = "/rename?token=" + token +
        "&type=" + encodeURIComponent(itemType) +
        "&path=" + encodeURIComponent(path) +
        "&name=" + encodeURIComponent(newName) +
        "&" + dummyQueries();

    readStatusResp(url, callback, failure);
}

function move(itemType, path, to, token, callback, failure)
{
    var url = "/move?token=" + token +
        "&type=" + encodeURIComponent(itemType) +
        "&path=" + encodeURIComponent(path) +
        "&to=" + encodeURIComponent(to) +
        "&" + dummyQueries();

    readStatusResp(url, callback, failure);
}

function ajaxDelete(path, token, callback, failure)
{
    var url = "/delete?token=" + token +
        "&path=" + encodeURIComponent(path) +
        "&" +dummyQueries();

    readStatusResp(url, callback, failure);
}

function showFolder(fileId, token, callback, failure)
{
    var url = "/openFolder?token=" + token +
        "&file=" + encodeURIComponent(fileId) +
        "&" + dummyQueries();

    readStatusResp(url, callback, failure);
}

function showFilesFolder(token, callback, failure)
{
    var url = "/findAllFiles?token=" + token +
        "&" + dummyQueries();

    readStatusResp(url, callback, failure);
}
