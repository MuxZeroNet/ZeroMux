

function dealWithUploadError(error)
{
    var text = "";
    if(isDict(error) && error.hasOwnProperty("message"))
    {
        // JSON
        text = error["message"];
        
        var confirmButton = document.getElementById("confirm-upload-button");
        attachToken(confirmButton, nop, nop);
    }
    else
    {
        text = "" + error;
    }

    showStatusReport(text, "red");
}

function initUploadUi()
{
    hideElement(document.getElementById("page-body"));
    hideElement(document.getElementById("sharing-panel"));
    showElement(document.getElementById("file-upload-panel"));
    
    autoHideReminder();
    
    setChooseFileButton();
    
    setStatusReport();
    setConfirmButton();
}

function setStatusReport()
{
    var inner = document.getElementById("repeated-request-inner");
    inner.setAttribute("data-default", inner.innerHTML);
}

function showStatusReport(text, color="normal")
{
    var repeatedRequest = document.getElementById("repeated-request");
    var inner = document.getElementById("repeated-request-inner");
    if(text.length > 0)
    {
        inner.innerText = text;
    }
    else
    {
        // show default text
        var html = inner.getAttribute("data-default");
        inner.innerHTML = html;
    }
    
    inner.classList.remove("color-pdf");
    inner.classList.remove("color-excel");
    
    switch(color)
    {
        case "red":
            inner.classList.add("color-pdf");
            break;
        
        case "green":
            inner.classList.add("color-excel");
            break;
    }
    
    showElement(repeatedRequest);
}

function setConfirmButton()
{
    var confirmButton = document.getElementById("confirm-upload-button");
    
    attachToken(confirmButton, function()
    {
        showElement(confirmButton);    
    }, dealWithUploadError);
    
    confirmButton.onclick = function()
    {
        var tokenAttached = popAttachedToken(confirmButton);
        if (tokenAttached.length == 0)
        {
            showStatusReport("");
            return;
        }
        
        var newName = selectNewNameTextbox().value;
        newName = newName.trim();

        confirmUpload(newName, tokenAttached, function(jsonResp)
        {
            showStatusReport("Done.", "green");
            
        }, dealWithUploadError);
    };
}

function selectNewNameTextbox()
{
    return document.getElementById("upload-new-name");
}

function setChooseFileButton()
{
    var chooseButton = document.getElementById("choose-file-button");
    
    // Parse "path"
    var queries = location.search.substring(1).split("&");
    var pathQueries = queries.filter(item => item.startsWith("path="));
    pathQueries = pathQueries.map(item => decodeURIComponent(item.substring("path=".length)));
    
    console.log(pathQueries);
    
    if(pathQueries.length < 1)
    {
        return;
    }
    var selectedPath = pathQueries[0];
    if(selectedPath.trim().length == 0)
    {
        return;
    }
    
    console.log(selectedPath);
    
    
    chooseButton.onclick = function()
    {
        var confirmButton = document.getElementById("confirm-upload-button");
        var confirmHasToken = (peekAttachedToken(confirmButton).length > 0);
        if(!confirmHasToken)
        {
            showStatusReport(" ");
            
            attachToken(confirmButton, function()
            {
                showElement(confirmButton);
            }, dealWithUploadError);
        }
        
        
        getToken(function(token)
        {
            chooseFile(selectedPath, token, putSelectFileInfo, dealWithFailure);
            
        }, dealWithFailure);
    };
    
    var selectedPathElement = document.getElementById("selected-file");

}

function putSelectFileInfo(jsonResp)
{
    var filePath = jsonResp["filePath"];
    document.getElementById("selected-file").innerText = filePath;
    var fileName = SepPathAndName(filePath)[1];
    selectNewNameTextbox().value = fileName;
}

function shouldShowReminder()
{
    if(!(typeof _BUNDLE_FIRST_RUN === "undefined") && !(_BUNDLE_FIRST_RUN))
    {
        if(!(typeof _BUNDLE_LAST_MODIFIED === "undefined"))
        {
            var now = new Date();
            var lastModified = new Date(_BUNDLE_LAST_MODIFIED);
            if(now - lastModified < 15 * 24 * 3600 * 1000)
            {
                return false;
            }
        }
    }
    
    return true;
}

function autoHideReminder()
{
    if(!shouldShowReminder())
    {
        for(var element of document.getElementsByClassName("reminder"))
        {
            hideElement(element);
        }
        
        hideElement(document.getElementById("reminder-title"));
        showElement(document.getElementById("normal-title"));
    }
}