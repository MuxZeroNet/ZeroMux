function hideElement(element)
{
    element.classList.add("hidden");
}

function showElement(element)
{
    element.classList.remove("hidden");
}

function elementTransparent(element)
{
    element.classList.add("transparent");
}

function elementOpaque(element)
{
    element.classList.remove("transparent");
}

function sepExt(name)
{
    var ext = "";
    if(name.includes("."))
    {
        var sepByDots = name.split(".");
        ext = sepByDots[sepByDots.length - 1].toLowerCase().trim();
    }
    
    return ext;
}

function chooseIconForExt(ext)
{
    var selectedStyle = null;
    
    if(ext != "")
    {
        for(var s of StyleList)
        {
            var styleInfo = s[1];
            var extList = s[2];

            if(extList.includes(ext))
            {
                selectedStyle = styleInfo;
            }
        }
    }
    
    if(selectedStyle == null)
    {
        selectedStyle = ["file-o", "color-black"];
    }
    
    return selectedStyle;
}

function showNewFolder(name, href=null, onclick=null)
{
    var itemElement = createFolderItem(name, "folder", "color-folder", href, onclick);
    document.getElementById("file-list").appendChild(itemElement);
    return itemElement;
}

function showNewFile(name, href=null, onclick=null)
{
    var ext = sepExt(name);
    
    var selectedStyle = chooseIconForExt(ext);
    
    var itemElement = createFolderItem(name, selectedStyle[0], selectedStyle[1], href, onclick);
    
    document.getElementById("file-list").appendChild(itemElement);
    return itemElement;
}

function createFolderItem(name, iconName, additionalStyles, href, onclick)
{
    var itemElement = document.createElement('div');
    itemElement.className = "folder-item";
    itemElement.onclick = function(e)
    {
        showCheckBox(itemElement);
    };
    
    
    var itemIconElement = document.createElement('i');
    itemIconElement.className = "fa fa-fw fa-" + iconName + " " + additionalStyles;
    
    
    var itemLinkElement = document.createElement('a');
    itemLinkElement.className = "item-link";
    itemLinkElement.href = "#";
    itemLinkElement.innerText = name;
    if(href != null && href.trim().length > 0)
    {
        itemLinkElement.href = href;
        itemLinkElement.target = "_top";
    }
    itemLinkElement.onclick = function(e)
    {
        e.stopPropagation();
        if(onclick != null)
        {
            return onclick();
        }
    }
    
    
    var checkBoxElement = document.createElement('input');
    checkBoxElement.type = "checkbox";
    checkBoxElement.className = "item-checkbox hidden";
    checkBoxElement.onclick = onCheckBoxClicked;
    checkBoxElement.onchange = onCheckBoxChanged;
    
    itemElement.appendChild(checkBoxElement);
    itemElement.appendChild(itemLinkElement);
    itemLinkElement.insertBefore(itemIconElement, itemLinkElement.firstChild);
    
    
    return itemElement;
}


// checkboxes

function getAllCheckBoxes(excludeTop="")
{
    if(excludeTop == "excludeTop")
    {
        return document.getElementById("file-list").getElementsByClassName("item-checkbox");
    }
    else
    {
        return document.getElementsByClassName("item-checkbox");
    }
    
}

function checkAllBoxes()
{
    var allCheckBoxes = getAllCheckBoxes();
    for(var c of allCheckBoxes)
    {
        c.checked = true;
    }
}

function uncheckAllBoxes()
{
    var allCheckBoxes = getAllCheckBoxes();
    for(var c of allCheckBoxes)
    {
        c.checked = false;
    }
}

function resetAllBoxes()
{
    uncheckAllBoxes();
    
    var allCheckBoxes = getAllCheckBoxes();
    for(var c of allCheckBoxes)
    {
        hideElement(c);
    }
    
    changeToolbar(false);
}

function getAllCheckedItems()
{
    var checked = [];
    
    var folderItems = document.getElementsByClassName("folder-item");
    for(var element of folderItems)
    {
        var checkbox = element.getElementsByClassName("item-checkbox")[0];
        if(checkbox.checked)
        {
            checked.push(element);
        }
    }
    
    return checked;
}


function changeToolbar(selected)
{
    if(selected)
    {
        document.getElementById("buttons-default").classList.add("hidden");
        document.getElementById("buttons-selected").classList.remove("hidden");
    }
    else
    {
        document.getElementById("buttons-default").classList.remove("hidden");
        document.getElementById("buttons-selected").classList.add("hidden");
    }
    
}

function showBackButton()
{
    showElement(document.getElementById("back-container"));
}

function hideBackButton()
{
    hideElement(document.getElementById("back-container"));
}

function allUnchecked()
{
    var allCheckBoxes = getAllCheckBoxes("excludeTop");
    for(var c of allCheckBoxes)
    {
        if(c.checked)
        {
            return false;
        }
    }
    
    return true;
}

function allChecked()
{
    var allCheckBoxes = getAllCheckBoxes("excludeTop");
    for(var c of allCheckBoxes)
    {
        if(!c.checked)
        {
            return false;
        }
    }
    
    return true;
}

function moreThanOneChecked()
{
    var allCheckBoxes = getAllCheckBoxes();
    var n = 0;
    for(var c of allCheckBoxes)
    {
        if(c.checked)
        {
            n = n + 1;
        }
        
        if(n > 1)
        {
            return true;
        }
    }
    
    return false;
}

function showCheckBox(where)
{   
    var checkBox = where.getElementsByClassName("item-checkbox")[0];
    
    var allCheckBoxes = getAllCheckBoxes();
    
    if(!checkBox.classList.contains("hidden"))
    {
        checkBox.click();
    }
    else
    {
        for(var c of allCheckBoxes)
        {
            c.classList.remove("hidden");
        }
        
        if(checkBox.checked)
        {
            checkBox.click();
        }
        checkBox.click();
        
    }
}

function onCheckBoxClicked(e)
{
    e.stopPropagation();
}

function onCheckBoxChanged(e)
{
    if(allUnchecked())
    {
        resetAllBoxes();
    }
    else
    {
        // change toolbar
        changeToolbar(true);
        
        if(allChecked())
        {
            document.getElementById("upper-checkbox").checked = true;
        }
        else
        {
            // some checked, some not
            document.getElementById("upper-checkbox").checked = false;
        }
    }
}
    

function showDialog(dialogContainer, shown, cancel)
{
    // close button
    var closeButton = dialogContainer.getElementsByClassName("dialog-buttons")[0];
    closeButton.onclick = function()
    {
        hideElement(dialogContainer);
        cancel();
    };
    
    showElement(dialogContainer);
    shown();
}

function getDisplayedName(folderItemElement)
{
    var linkElement = folderItemElement.getElementsByClassName("item-link")[0];
    return linkElement.innerText.trim();
}

function getDisplayedIcon(folderItemElement)
{
    return folderItemElement.getElementsByTagName("i")[0].classList;
}
    
var StyleList = [
    ["code", ["file-code-o", "color-excel"], ["as", "asm", "asp", "aspx", "awk", "bash", "bat", "c", "cc", "cmd", "cpp", "cs", "css", "csx", "cxx", "h", "htm", "html", "hxx", "inf", "ini", "java", "js", "json", "jsp", "jsx", "l", "ll", "lua", "map", "matlab", "php", "pl", "py", "rb", "res", "rpyc", "s", "sh", "src", "vbs", "xml", "xrb", "y", "yaml", "yxx"]],

    ["image", ["file-image-o", "color-pics"], ["ai", "bmp", "emf", "gif", "jpeg", "jpg", "pcx", "png", "ppm", "psd", "svg", "tga", "tif", "tiff", "wmf"]],

    ["document-doc", ["file-word-o", "color-word"], ["doc", "docm", "docx", "dot", "dotm", "dotx", "odm", "odt", "oth", "ott", "wpd", "wps"]], 

    ["document-xls", ["file-excel-o", "color-excel"], ["csv", "ods", "ots", "xls", "xlsb", "xlsm", "xlsx", "xltm", "xltx"]], 

    ["document-ppt", ["file-powerpoint-o", "color-ppt"], ["odg", "odp", "otp", "potm", "potx", "pps", "ppsm", "ppsx", "ppt", "pptm", "pptx", "sldm", "sldx"]], 

    ["document-txt", ["file-text-o", "color-word"], ["azw", "azw3", "djvu", "epub", "ipynb", "kf8", "lit", "log", "markdown", "md", "mobi", "prc", "rst", "rtf", "txt"]], 

    ["document-pdf", ["file-pdf-o", "color-pdf"], ["pdf"]], 

    ["archive", ["file-archive-o", "color-archive"], ["7z", "ace", "bz2", "cab", "cb7", "cba", "cbr", "cbt", "cbz", "deb", "dmg", "gz", "gzip", "img", "iso", "rar", "rpm", "tar", "tgz", "xz", "zip"]], 
    
    ["music", ["file-audio-o", "color-pics"], ["aac", "aiff", "alac", "ape", "dts", "flac", "m4a", "mid", "midi", "mp3", "oga", "ogg", "opus", "pcm", "shn", "tta", "wav", "wma", "wv"]],
    
    ["video", ["file-video-o", "color-pics"], ["avi", "f4v", "flv", "m4v", "mkv", "mov", "mp4", "ogv", "webm", "wmv"]],
    
    ["torrent", ["files-o", "color-excel"], ["torrent"]], 
];