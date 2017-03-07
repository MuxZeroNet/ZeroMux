_confirmBeforeLeaving = false;

function confirmBeforeLeaving(a)
{
    _confirmBeforeLeaving = a;
}

function initSharePanelUi()
{
    hideElement(document.getElementById("page-body"));
    hideElement(document.getElementById("file-upload-panel"));
    showElement(document.getElementById("sharing-panel"));

    window.onbeforeunload = function()
    {
        if(_confirmBeforeLeaving)
        {
            return "Are you sure?";
        }
    };

    reloadData("", function()
    {
        putFileToUploadUi(
            location.search.substring(1).split("&")[0]
        );
    });
}

function showBigIcon(iconName, additionalStyles)
{
    var fileIconElement = document.getElementById("file-icon");
    fileIconElement.classList = "fa fa-fw fa-5x fa-" + iconName +" " + additionalStyles;

    var fileAreaElement = document.getElementById("file-area")
    showElement(fileAreaElement);
}

function showFileName(name)
{
    var fileNameElement = document.getElementById("file-name");
    fileNameElement.innerText = name;
    showElement(fileNameElement);
}

function adjustProgressBarSize()
{
    var blockCount = document.getElementsByClassName('progress-block').length;
    selectProgressBar().style.width = (20 * blockCount) + "px";
}

function showSpeed(speedText)
{
    var speedElement = document.getElementById("speed");
    speedElement.innerText = speedText;
}

function prettifySize(size)
{
    if(size < 1024)
    {
        return Math.round(size) + " B";
    }
    else if(size < 1024*1024)
    {
        return Math.round(size / 1024) + " KB";
    }
    else if(size < 1024*1024*1024)
    {
        return (size / 1024 / 1024).toFixed(2) + " MB";
    }
    else
    {
        return (size / 1024 / 1024 / 1024).toFixed(2) + " GB"
    }

}

function showFileSize(sizeText)
{
    var fileSizeElement = document.getElementById("file-size");
    fileSizeElement.innerText = sizeText;
    showElement(fileSizeElement);
}


function selectDownloadButton()
{
    return document.getElementById("button-download");
}

function selectDownloadArea()
{
    return document.getElementById("download-outside");
}

function setSaveLink(hiddenLink)
{
    showElement(document.getElementById("save-container"));

    var saveLink = document.getElementById("save-blob");
    handleFirefoxBug(hiddenLink, saveLink);
    saveLink.click();
}

function handleFirefoxBug(hiddenLink, saveLink)
{
    if(hiddenLink.hasAttribute("download"))
    {
        saveLink.onclick = function()
        {
            hiddenLink.click();
        }
    }
    else
    {
        saveLink.href = hiddenLink.href;
        saveLink.target = "_top";
    }
}

var _progressBarElement = null;

function selectProgressBar()
{
    if(_progressBarElement == null)
    {
        _progressBarElement = document.getElementById("progress-bar");
    }
    return _progressBarElement;
}

function showWhitePart()
{
    showElement(document.getElementById("white-part"));
}

function getProgressBlockId(index)
{
    return "pblock-index" + index;
}

function selectProgressBlock(index)
{
    return document.getElementById(getProgressBlockId(index));
}

function changeBlockColor(index, styleString)
{
    selectProgressBlock(index).classList = "progress-block " + styleString;
}

function changeAllBlockColor(styleString)
{
    var blocks = document.getElementsByClassName('progress-block');
    for(var element of blocks)
    {
        element.classList = "progress-block " + styleString;
    }
}

function initProgressBar(nParts)
{
    var progressBar = selectProgressBar();
    progressBar.innerHTML = "";

    for(var index = 0; index < nParts; index++)
    {
        var progressBlock = document.createElement('div');
        progressBlock.classList = "progress-block color-empty";
        progressBlock.id = getProgressBlockId(index);

        progressBar.appendChild(progressBlock);
    }

    adjustProgressBarSize();

}

function isOldFirefox()
{
    var ua = navigator.userAgent;
    if(ua.indexOf("Firefox/") < 0)
    {
        return false; // not Firefox
    }

    var start = "Firefox/";
    var end = ".";
    var version = ua.substring(ua.indexOf(start) + start.length);
    version = version.substring(0, version.indexOf(end));

    return parseInt(version) < 52;
}

function isSandboxed()
{
    var result = sandblaster.detect();
    return (result == undefined || result == null || result.sandboxed);
}

function makeDownloadLinkElement(blobString, friendlyName)
{
    var link = document.createElement('a');
    link.classList = "hidden";

    link.href = blobString;
    link.target = "_top";

    if( !(isOldFirefox() && isSandboxed()) )
    {
        link.download = friendlyName;
    }

    document.body.appendChild(link);
    return link;
}

function putFileToUploadUi(fileId)
{
    console.log(fileId);

    var fileInfo = FindFile(ConstructFileInfo(fileId), GlobalFileList);

    var byId = function(a) { return document.getElementById(a); };

    if (fileInfo == null)
    {
        showBigIcon("question", "");
        showFileName("File not found!");
        return;
    }

    // show icon and file name
    var fileName = FileName(fileInfo)
    var styles = chooseIconForExt(sepExt(fileName));
    showBigIcon(styles[0], styles[1]);
    showFileName(fileName);

    var fileJsonPath = FileJson(fileInfo) + "?" + dummyQueries();


    var callback = function(xmlHttp)
    {
        var j = readFileJson(xmlHttp.responseText);
        var bigFileInfo = j[0];
        var fileParts = j[1];

        // show file size and init progress bar
        var fileSize = bigFileInfo["size"];

        showFileSize("(" + prettifySize(fileSize) + ")");
        initProgressBar(fileParts.length);

        // set download button
        var downloadButton = selectDownloadButton();
        downloadButton.onclick = makeDownloadHandler(fileJsonPath, fileName, fileSize);

        showElement(selectDownloadArea());
    };

    var failure = function()
    {
        showBigIcon("remove", "");
        showFileName("Failed to load file.json");
        showFileSize("Reload this page to try again")
    };

    requestText(fileJsonPath, "application/json", callback, failure);
}

function makeDownloadHandler(jsonPath, friendlyName, fileSize)
{
    // initialize the list of events
    var events = initEventObj();

    // triggers when file.json is loaded or failed to load
    events.onjsonload = jsonload;
    events.onjsonerror = jsonerror;

    // triggers when a file chunk is being added (being downloaded and verified),
    // added, or failed to add to the internal buffer
    events.onadding = adding;
    events.onadded = added;
    events.onpieceerror = pieceerror;

    // triggers when the original big file is being build, built or failed to build.
    events.onblobbuilding = function(e) { blobbuilding(fileSize); };
    events.onfinish = function(blob) { finish(blob, friendlyName); };
    events.onbuilderror = builderror;

    events.otherParams = {"blobType": "application/force-download"};

    var f = function()
    {
        hideElement(selectDownloadArea());
        showWhitePart();

        downloadBigFile(jsonPath, events);
    };

    return f;
}

function jsonload(infoArgs)
{
    confirmBeforeLeaving(true);
    showSpeed("Downloading chunk #1...");
}

function jsonerror(error)
{
    // `error` is an error object
    console.error(error);
    confirmBeforeLeaving(false);

    showSpeed("Cannot download file.json. Please reload this page.");
}

var _chunkStartTime = 0;

function adding(index)
{
    _chunkStartTime = new Date();

    // `index` is the index of the chunk that is being downloaded
    changeBlockColor(index, "color-downloading");
    // change progress bar color
}

function added(eventArgs)
{
    var index = eventArgs["index"];
    var bytes = eventArgs["pieceBytes"];
    // pieceBytes is an ArrayBuffer that contains
    // the binary data of the chunk

    var now = new Date();
    var chunkSize = bytes.byteLength;
    var speed = chunkSize / ( (now - _chunkStartTime) / 1000);
    if(speed > 10)
    {
        showSpeed(prettifySize(speed) + "/s");
    }
    else
    {
        showSpeed("Downloading...");
    }


    changeBlockColor(index, "color-done");
}

function pieceerror(index)
{
    // when a "PieceError" happens, download.js returns.

    // `index` is the index of the chunk that has an error
    changeBlockColor(index, "color-failed");

    confirmBeforeLeaving(false);

    showSpeed("Bad network condition -- Please reload this page to resume your progress.");
}

function blobbuilding(fileSize)
{
    changeAllBlockColor("color-downloading");

    var tip = "";

    if(fileSize > 30 * 1024 * 1024)
    {
        var megaBytes = fileSize / 1024 / 1024;
        var seconds = Math.round(0.074 * megaBytes);

        tip = "(may take up to " + seconds + " seconds)"
    }

    showSpeed("Verifying..." + tip);
}

function finish(blob, friendlyName)
{
    changeAllBlockColor("color-done");
    showSpeed(" ");
    confirmBeforeLeaving(false);

    // `blob` contains the reassembled big file
    var url = URL.createObjectURL(blob);

    var hiddenLink = makeDownloadLinkElement(url, friendlyName);
    setSaveLink(hiddenLink);
}

function builderror(e)
{
    // `e` is null
    changeAllBlockColor("color-failed");

    confirmBeforeLeaving(false);
}
