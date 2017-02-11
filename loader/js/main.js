GlobalFileList = null;
GlobalRootFolderContent = null;
GlobalAllFolderIds = null;

GlobalCurrentPath = null;
GlobalCurrentFolderContent = null;
GlobalClipBoard = null;
GlobalCurrentFilter = null;

function main()
{
    if(location.search.startsWith("?page=upload&"))
    {
        // uploading
        initUploadUi();
    }
    else if(location.search.startsWith("?1"))
    {
        // file sharing
        initSharePanelUi();
    }
    else
    {
        // default: file management
        var pyMode = true;
        var andGoTo = "C:/";

        pyMode = location.pathname.endsWith("/loader.py");

        if(location.search.startsWith("?2"))
        {
            // folder sharing
            andGoTo = location.search.split("&")[0];
        }

        initUi(pyMode);
        reloadData(andGoTo);
    }


}

function initUi(pyMode=true)
{
    var byId = function(a) { return document.getElementById(a); };

    // buttons on the left
    var buttonBrowse = byId("button-browse");
    buttonBrowse.onclick = makeSelect(buttonBrowse, makeFolderReload("C:/"));

    var commands = [
        ["button-all-files", ""],
        ["button-documents", "document-"],
        ["button-music", "music"],
        ["button-pictures", "image"],
        ["button-videos", "video"],
        ["button-archives", "archive"],
        ["button-torrents", "torrent"],
    ];

    for(var cmd of commands)
    {
        var id = cmd[0];
        var filter = cmd[1];

        var button = byId(id);
        button.onclick = makeSelect(button, makeFileDisplay(filter));
    }

    // checkbox on the top
    var checkBoxTop = byId("upper-checkbox");
    checkBoxTop.onclick = function(e)
    {
        if(checkBoxTop.checked)
        {
            checkAllBoxes();
        }
        else
        {
            resetAllBoxes();
        }
    }

    // back button
    byId("button-back").onclick = function(e)
    {
        var sep = SepPathAndName(GlobalCurrentPath);
        var parentFolder = sep[0];
        var currentFolder = sep[1];

        if(parentFolder != null)
        {
            goToFolder(parentFolder);
        }

        return false;
    }

    // py mode?
    if(!pyMode)
    {
        hideElement(byId("py-container-1"));
        hideElement(byId("py-container-2"));
    }

    // upload button
    setUploadButton("C:/");
    // new folder, rename, delete, copy link
    initDialog();
    // cut
    initClipBoard();
}

VaguePathHint = "C:/.../";

function initDialog()
{
    initNewFolderDialog();
    document.getElementById("button-new-folder").onclick = function()
    {
        showNewFolderDialog();
        return false;
    };

    // rename
    initRenameDialog();
    document.getElementById("button-rename").onclick = function()
    {
        var selectedItems = getAllCheckedItems();
        if(selectedItems.length == 1)
        {
            var selected = selectedItems[0];

            var itemType = selected.getAttribute("data-type");
            var pathHint = selected.getAttribute("data-hint");
            if(pathHint.length == 0)
            {
                if(itemType == "folder")
                {
                    console.error("folder: no path hint");
                }
                else
                {
                    pathHint = VaguePathHint;
                }
            }
            var filePath = pathHint + selected.getAttribute("data-id");
            var oldName = selected.getAttribute("data-name");

            var iconStyles = getDisplayedIcon(selected);

            var renameButton = selectRenameConfirmButton();
            attachToken(renameButton,
            function()
            {
                showRenameDialog(itemType, oldName, filePath, iconStyles);
            }, dealWithFailure);


        }

        return false;
    };

    // delete
    initDeleteFileDialog();
    document.getElementById("button-delete").onclick = function()
    {
        var deleteConfirmButton = selectDeleteConfirmButton();
        attachToken(deleteConfirmButton,
        function()
        {
            showDeleteFileDialog(getAllCheckedItems());
        });
    };

    // copy link
    document.getElementById("button-copy-link").onclick = function()
    {
        showCopyLinkDialog(getAllCheckedItems());
        return false;
    };

}

function selectCutButton()
{
    return document.getElementById("button-cut");
}

function selectPasteButton()
{
    return document.getElementById("button-paste");
}

function showCutPaste(showOrNot)
{
    // var buttonCut = selectCutButton();
    var buttonPaste = selectPasteButton();
    if(showOrNot)
    {
        // showElement(buttonCut);
        showElement(buttonPaste);
        showElement(document.getElementById("cut-container"));
    }
    else
    {
        // hideElement(buttonCut);
        hideElement(buttonPaste);
        hideElement(document.getElementById("cut-container"));
    }
}

function checkClipBoardAndShow()
{
    // show cut and paste
    showCutPaste(true);
    // hide paste
    if(isClipBoardEmpty())
    {
        hideElement(selectPasteButton());
    }
}

function initClipBoard()
{
    clearClipBoard();

    var buttonCut = selectCutButton();
    var buttonPaste = selectPasteButton();

    buttonCut.onclick = function()
    {
        cutFiles(); // replace items in clipboard

        // show paste
        showCutPaste(true);
        resetAllBoxes();

        // switch style
        changeFileStyleClipBoard();

        return false;
    };

    buttonPaste.onclick = function()
    {
        showBlockDialog();

        pasteFiles();

        checkClipBoardAndShow();

        return false;
    };

}

function cutFiles()
{
    var selected = getAllCheckedItems();

    var ids = selected.map(item => [item.getAttribute("data-id"), item.getAttribute("data-type")]);
    var pathHint = GlobalCurrentPath;

    setClipBoard(pathHint, ids);
}

function pasteFiles()
{
    var pathHint = getClipBoardPathHint();
    var items = getClipBoardItems();
    var toPath = GlobalCurrentPath;

    clearClipBoard();

    pasteFilesRecursive(toPath, pathHint, items);
}

function pasteFilesRecursive(toPath, pathHint, items, stage=0)
{
    var resetUi = function(e)
    {
        // reset ui ...
        hideBlockDialog();
        // refresh view
        refreshView();

        if(e != null)
        {
            dealWithFailure(e);
        }
    };

    if(stage > 1)
    {
        resetUi();
        return;
    }

//    var currentItem = items[index];
//    var itemType = currentItem[1];
//    var path = pathHint + "/" + currentItem[0];

    var itemType = (stage == 0) ? "file" : "folder";
    var filteredItems = items.filter(i => i[1] == itemType);
    var path = filteredItems.map(i => pathHint + "/" + i[0]).join("|");

    console.log(filteredItems);
    console.log(path.split("|"));


    if(path.length == 0)
    {
        // next stage
        pasteFilesRecursive(toPath, pathHint, items, stage+1);
    }
    else
    {
        console.log(["Moving", itemType, path, "to", toPath].join(" "));

        getToken(function(token)
        {
            move(itemType, path, toPath, token, function()
            {
                pasteFilesRecursive(toPath, pathHint, items, stage+1);

            }, resetUi);

        }, resetUi);
    }

}

function clearClipBoard()
{
    GlobalClipBoard = {};

    console.info("Clipboard Cleared");
}

function isClipBoardEmpty()
{
    return GlobalClipBoard == null || !GlobalClipBoard.hasOwnProperty("pathHint");
}

function setClipBoard(pathHint, items)
{
    GlobalClipBoard = {"pathHint": pathHint, "items": items};
}

function getClipBoardPathHint()
{
    return GlobalClipBoard["pathHint"];
}

function getClipBoardItems()
{
    return GlobalClipBoard["items"];
}


function showBlockDialog()
{
    showElement(document.getElementById("block-dialog"));
}

function hideBlockDialog()
{
    hideElement(document.getElementById("block-dialog"));
}

function changeFileStyleClipBoard()
{
    if(GlobalCurrentPath != getClipBoardPathHint())
    {
        return;
    }

    var elements = document.getElementsByClassName("folder-item");
    var inClipBoard = getClipBoardItems().map(i => i[0]);
    for(var el of elements)
    {
        if(inClipBoard.includes(el.getAttribute("data-id")))
        {
            elementTransparent(el);
        }
        else
        {
            elementOpaque(el);
        }
    }



    for(var item of inClipBoard)
    {

    }
}

function setUploadButton(targetPath)
{
    var uploadButton = document.getElementById("button-upload")
    uploadButton.href = "?page=upload&path=" + encodeURIComponent(targetPath);
    uploadButton.target = "_blank";
}

function reloadData(andGoTo="C:/", callback=null)
{
    var c = callback;
    if(c == null)
    {
        c = function()
        {
            if(andGoTo != null && andGoTo.length > 0)
            {
                goToFolder(andGoTo);
            }
        };
    }

    requestText(
        "files/list.json" + "?" + dummyQueries(),
        "application/json",

        function(xmlHttp)
        {
            if(xmlHttp.status >= 400)
            {
                console.error("Cannot load list.json: got a " + xmlHttp.status);
                loadData("{}");
            }
            else
            {
                loadData(xmlHttp.responseText);
            }

            c();
        },

        function(xmlHttp, reason)
        {
            console.error(reason);
            loadData("{}");
            c();
        }
    );
}

function loadData(listJsonStr)
{
    GlobalAllFolderIds = new Set();

    if(GlobalClipBoard == null)
    {
        clearClipBoard();
    }

    var ff = ReadRawListJson(listJsonStr);
    var files = ff[0];
    var folders = ff[1];
    if(files == null || folders == null)
    {
        files = [];
        folders = [];
    }

    GlobalFileList = ReadRawFileList(files);
    GlobalRootFolderContent = ReadRawFolderContent(folders, C_DRIVE_SLASH, GlobalAllFolderIds);
}

function goToFolder(path)
{
    var folder = null;
    var cleanPath = "";

    if(path.startsWith("?"))
    {
        var folderId = path.substring(1);
        var folder = FindFolderRecursive(ConstructFolderInfo(folderId), GlobalRootFolderContent);
        if(folder != null)
        {
            cleanPath = SepPathHint(folder.pathHint + "/" + folderId).join("/") + "/";
        }
    }
    else
    {
        cleanPath = SepPathHint(path).join("/") + "/";
        folder = FindFolderByPath(cleanPath, GlobalRootFolderContent, GlobalAllFolderIds);
    }

    if(folder == null)
    {
        // defaults to C:/ instead
        // cleanPath = "C:/";
        // folder = FindFolderByPath(cleanPath, GlobalRootFolderContent, GlobalAllFolderIds);
        // console.warn("Folder not found. The root folder will be loaded.");

        clearPanel();
        showNewFile("Folder not found! Click here to go to root folder.", location.href.split("?")[0]);
        return;
    }

    GlobalCurrentPath = cleanPath;


    // toolbar
    if(FolderId(folder) == ROOT_FOLDER_ID)
    {
        hideBackButton();
    }
    else
    {
        showBackButton();
    }
    // ui file list
    var folderContent = FolderContent(folder);
    putFolderToUi(folderContent, cleanPath, GlobalFileList);
    // upload button
    setUploadButton(GlobalCurrentPath);
    // cancel filter
    GlobalCurrentFilter = null;
    // cut paste
    checkClipBoardAndShow();
}

function clearPanel()
{
    var filePanel = document.getElementById("file-list");
    filePanel.innerHTML = "";

    resetAllBoxes();
}

function sortFolderItems(a, b, fileList)
{
    var aIsFolder = IsFolderInfo(a);
    var bIsFolder = IsFolderInfo(b);
    if(aIsFolder != bIsFolder)
    {
        return aIsFolder ? -1 : 1;
    }
    else
    {
        var aName = "";
        var bName = "";

        if(aIsFolder)
        {
            aName = FolderName(a);
        }
        else
        {
            var pointerTarget = PointerTarget(a);
            var file = fileList[pointerTarget]; // #!
            aName = FileName(file);
        }

        if(bIsFolder)
        {
            bName = FolderName(b);
        }
        else
        {
            var pointerTarget = PointerTarget(b);
            var file = fileList[pointerTarget]; // #!
            bName = FileName(file);
        }


        var aExt = sepExt(aName);
        var bExt = sepExt(bName);

        var extCompare = aExt.localeCompare(bExt);
        if(extCompare != 0)
        {
            return extCompare;
        }
        else
        {
            return aName.localeCompare(bName);
        }
    }
}

function putFolderToUi(folderContent, folderPath, fileList)
{
    clearPanel();

    // sort
    var orderedArray = [];

    for(var key in folderContent)
    {
        var item = SelectItemInContent(folderContent, key);
        orderedArray.push(item);
    }

    orderedArray = orderedArray.sort(function(a, b) { return sortFolderItems(a, b, fileList); });

    for(var item of orderedArray)
    {
        console.log(item);

        if(IsFolderInfo(item))
        {
            putFolder(item);
        }
        else if(IsFilePointer(item))
        {
            putFile(item, folderPath, fileList);
        }
        else
        {
            console.error(item);
        }
    }
}

function putFolder(folderInfo)
{
    var folderName = FolderName(folderInfo);

    var folderPath = FolderPathHint(folderInfo) + "/" + FolderId(folderInfo);
    var onclick = makeFolderOnClick(folderPath);
    var href = "#" + FolderId(folderInfo);

    var element = showNewFolder(folderName, href, onclick);
    element.setAttribute("data-type", "folder");
    element.setAttribute("data-id", FolderId(folderInfo));
    element.setAttribute("data-hint", FolderPathHint(folderInfo));
    element.setAttribute("data-name", folderName);

    return element;
}

function putFile(fileInfo, pathHint, fileList)
{
    var pointerTarget = PointerTarget(fileInfo);
    // var file = FindFile(ConstructFileInfo(pointerTarget), fileList);
    var file = fileList[pointerTarget]; // #!

    if(file == null)
    {
        console.warn("File " + pointerTarget + " not found.");
        return;
    }

    var fileName = FileName(file);

    var href = "?" + pointerTarget;

    var element = showNewFile(fileName, href);
    element.setAttribute("data-type", "file");
    element.setAttribute("data-id", pointerTarget);
    element.setAttribute("data-hint", pathHint);
    element.setAttribute("data-name", fileName);
    return element;
}

function makeFolderOnClick(folderPath)
{
    var f = function()
    {
        goToFolder(folderPath);
        return false;
    };

    return f;
}

function makeFolderReload(folderPath)
{
    var f = function()
    {
        reloadData(folderPath);
        return false;
    }

    return f;
}

function makeSelect(selectWhat, afterThat)
{
    var f = function()
    {
        var selectedButtons = document.getElementsByClassName("left-button-selected");
        for(var element of selectedButtons)
        {
            element.classList.remove("left-button-selected");
        }
        selectWhat.classList.add("left-button-selected");

        afterThat();
    };

    return f;
}

function makeFileDisplay(filter)
{
    var f = function()
    {
        fileDisplay(filter);
        return false;
    };

    return f;
}

function fileDisplay(filter)
{
    GlobalCurrentFilter = filter;
    hideBackButton();
    showCutPaste(false);
    clearClipBoard();
    setUploadButton("C:/");
    clearPanel();

    var extensionList = [];
    if(filter != "")
    {
        for(var item of StyleList)
        {
            if(item[0].startsWith(filter))
            {
                extensionList = extensionList.concat(item[2]);
            }
        }
    }

    var fileList = GlobalFileList;

    // sort
    var orderedFileList = [];

    for(var key in fileList)
    {
        var fileInfo = fileList[key]; // #!
        orderedFileList.push(fileInfo);
    }
    orderedFileList.sort(function(a, b)
    {
        return FileName(a).localeCompare(FileName(b));
    });


    for(var fileInfo of orderedFileList)
    {
        if(filter == "")
        {
            putFile(fileInfo, "", fileList);
        }
        else
        {
            var fileName = FileName(fileInfo);

            if(fileName.includes("."))
            {
                var sepByDots = fileName.split(".");
                var ext = sepByDots[sepByDots.length - 1].toLowerCase().trim();

                if(extensionList.includes(ext))
                {
                    putFile(fileInfo, "", fileList);
                }
            }
        }
    }

}

function refreshView()
{
    if(GlobalCurrentFilter == null)
    {
        reloadData(GlobalCurrentPath);
    }
    else
    {
        reloadData("", function()
        {
            fileDisplay(GlobalCurrentFilter);
        });
    }
}

function selectNewFolderDialog()
{
    return document.getElementById("new-folder-dialog");
}

function selectCreateButton()
{
    return document.getElementById("create-new-folder");
}

function selectNewFolderNameBox()
{
    return document.getElementById("new-folder-name");
}

function selectRenameDialog()
{
    return document.getElementById("rename-dialog");
}

function selectRenamedItemTextBox()
{
    return document.getElementById("renamed-item-name");
}

function selectRenameDialogIcon()
{
    return document.getElementById("rename-dialog-icon");
}

function selectRenameConfirmButton()
{
    return document.getElementById("rename-folder-item");
}

function selectDeleteDialog()
{
    return document.getElementById("delete-dialog");
}

function showDeleteDialogIcon(iconStyle, displayedName)
{
    var icon = document.getElementById("delete-icon");
    var fileName = document.getElementById("delete-file-name");

    icon.classList = iconStyle;
    fileName.innerText = displayedName;

    var iconArea = document.getElementById("delete-icon-area");
    showElement(iconArea);
}

function hideDeleteDialogIcon()
{
    var iconArea = document.getElementById("delete-icon-area");
    hideElement(iconArea);
}

function setDeleteDialogCounter(innerHtml)
{
    var counterArea = document.getElementById("delete-file-counter");
    counterArea.innerHTML = innerHtml;
}

function selectDeleteConfirmButton()
{
    return document.getElementById("delete-confirm-button");
}

function selectDeleteCancelButton()
{
    return document.getElementById("delete-cancel-button");
}


function initNewFolderDialog()
{
    var newFolderDialog = selectNewFolderDialog();
    var createButton = selectCreateButton();

    createButton.onclick = function()
    {
        var tokenAttached = peekAttachedToken(createButton);
        if(tokenAttached.length == 0)
        {
            console.error("No token!");
            return;
        }

        var newName = selectNewFolderNameBox().value.trim();
        if(newName.length == 0)
        {
            console.log(newName + "<-- empty name");
            return;
        }

        popAttachedToken(createButton);

        // send request
        newFolder(GlobalCurrentPath, newName, tokenAttached,
        function()
        {
            // close dialog
            hideElement(newFolderDialog);
            // refresh
            refreshView();

        }, dealWithFailure);
    };

    selectNewFolderNameBox().onkeyup = function(e)
    {
        if(e.keyCode == 13)
        {
            createButton.click();
        }
    };
}

function showNewFolderDialog()
{
    selectNewFolderNameBox().value = "New Folder";

    var shown = function()
    {
        setTimeout(function()
        {
            var textbox = selectNewFolderNameBox();
            textbox.select();
        }, 1);

        console.log("shown");

    };

    var cancel = function(){console.log("cancelled");}

    var createButton = selectCreateButton();
    attachToken(createButton, function()
    {
        showDialog(selectNewFolderDialog(), shown, cancel);

    }, dealWithFailure);
}

function initRenameDialog()
{
    var renameButton = selectRenameConfirmButton();
    renameButton.onclick = function()
    {
        var tokenAttached = peekAttachedToken(renameButton);
        if(tokenAttached.length == 0)
        {
            console.error("No token.");
            return;
        }

        var textbox = selectRenamedItemTextBox();
        var newName = textbox.value.trim();

        if(newName.length == 0)
        {
            return;
        }

        var oldName = renameButton.getAttribute("data-old-name");
        if(newName == oldName)
        {
            hideElement(selectRenameDialog());
            return;
        }

        popAttachedToken(renameButton);

        var itemType = renameButton.getAttribute("data-item-type");
        var path = renameButton.getAttribute("data-path");

        // send request
        rename(itemType, path, newName, tokenAttached,
        function()
        {
            // hide dialog
            hideElement(selectRenameDialog());

            // refresh
            refreshView();


        }, dealWithFailure)
    };

    selectRenamedItemTextBox().onkeyup = function(e)
    {
        if(e.keyCode == 13)
        {
            renameButton.click();
        }
    };
}

function makeRenameButtonHandler(itemType, path, oldName)
{
    var renameButton = selectRenameConfirmButton();
    renameButton.setAttribute("data-item-type", itemType);
    renameButton.setAttribute("data-path", path);
    renameButton.setAttribute("data-old-name", oldName);
}

function showRenameDialog(itemType, oldName, filePath, iconStyles)
{
    // set rename button
    var renameButton = selectRenameConfirmButton();
    makeRenameButtonHandler(itemType, filePath, oldName);

    // set textbox
    var textbox = selectRenamedItemTextBox();
    textbox.value = oldName;

    // set icon
    selectRenameDialogIcon().classList = iconStyles;

    showDialog(selectRenameDialog(), function()
    {
        setTimeout(function()
        {
            textbox.select();
        }, 1);
    }, nop);

}

function makeLinkEntry(iconStyle, displayedName, permalink)
{
    // TODO
    var div = document.createElement('div');

    var icon = document.createElement('i');
    icon.classList = iconStyle;

    var nameSpan = document.createElement('span');
    nameSpan.innerText = displayedName.trim();

    var textboxContainer = document.createElement('div');
    textboxContainer.classList = "grey-textbox-container";

    var textbox = document.createElement('input');
    textbox.classList = "grey-textbox";
    textbox.value = permalink;
    textbox.onclick = function() { textbox.select(); };

    textboxContainer.appendChild(textbox);


    div.appendChild(icon);
    div.appendChild(nameSpan);
    div.appendChild(textboxContainer);
    div.appendChild(document.createElement('br'));

    return div;

    /*
    <div>
        <i class="fa fa-fw fa-magnet" aria-hidden="true"></i>
        <span>Torrent.torrent</span>
        <div class="grey-textbox-container">
            <input class="grey-textbox"></input>
        </div>
        <br>
    </div>
    */
}

function showCopyLinkDialog(selectedElements)
{
    var dialog = document.getElementById("permalink-dialog");
    var dialogContent = dialog.getElementsByClassName("dialog-content")[0];
    dialogContent.innerHTML = "";

    for(var element of selectedElements)
    {
        var iconStyle = getDisplayedIcon(element);
        var displayedName = getDisplayedName(element);

        var sepPath = location.pathname.split("/");
        var itemId = element.getAttribute("data-id");
        var permalink = sepPath.slice(0, sepPath.length - 1).join("/") + "/?" + itemId;


        var entryDiv = makeLinkEntry(iconStyle, displayedName, permalink);

        dialogContent.appendChild(entryDiv);
    }



    showDialog(dialog, function()
    {
        dialogContent.scroll({"top": 0, "left": 0});
    }, nop);
}

function initDeleteFileDialog()
{
    var deleteDialog = selectDeleteDialog();

    selectDeleteCancelButton().onclick = function()
    {
        hideElement(deleteDialog);
    };

    var confirmDelete = selectDeleteConfirmButton();
    confirmDelete.onclick = function()
    {
        var tokenAttached = peekAttachedToken(confirmDelete);
        if(tokenAttached.length == 0)
        {
            dealWithFailure("No token");
            return;
        }

        popAttachedToken(confirmDelete);

        var itemList = [];
        var elements = getAllCheckedItems();
        for(var el of elements)
        {
            itemList.push(GlobalCurrentPath + "/" + el.getAttribute("data-id"));
        }

        ajaxDelete(itemList.join("|"), tokenAttached,
        function()
        {
            hideElement(deleteDialog);
            refreshView();

        }, dealWithFailure);
    };

}

function showDeleteFileDialog(selectedElements)
{
    var iconStyle = null;
    var displayedName = null;
    var counterHtml = "";

    if(selectedElements.length == 1)
    {
        var element = selectedElements[0];
        iconStyle = getDisplayedIcon(element);
        displayedName = getDisplayedName(element);

        var elementType = (element.getAttribute("data-type") == "folder") ? "folder" : "file";
        counterHtml = "Delete <b>this " + elementType + ".</b>";
    }
    else
    {
        var fileCount = 0;
        var folderCount = 0;

        for(var element of selectedElements)
        {
            var elementType = element.getAttribute("data-type");
            if(elementType == "folder")
            {
                folderCount += 1;
            }
            else
            {
                fileCount += 1;
            }
        }

        var strFiles = "";
        if(fileCount > 0)
        {
            strFiles = fileCount + " file" + ((fileCount > 1) ? "s" : "");
        }

        var strFolders = "";
        if(folderCount > 0)
        {
            strFolders = folderCount + " folder" + ((folderCount > 1) ? "s" : "");
        }

        var strAnd = (fileCount > 0 && folderCount > 0) ? " and " : "";

        counterHtml = "Delete <b>" + strFiles + "</b>" + strAnd + "<b>" + strFolders + "</b>.";
    }

    if(iconStyle != null && iconStyle.length > 0)
    {
        showDeleteDialogIcon(iconStyle, displayedName);
    }
    else
    {
        hideDeleteDialogIcon();
    }

    setDeleteDialogCounter(counterHtml);

    showDialog(selectDeleteDialog(), nop, nop);
}

(function(){
    main();
})()
