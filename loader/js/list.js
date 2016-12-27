function isList(value)
{
    return ({}).toString.call(value) === "[object Array]";
}

function isDict(value)
{
    return ({}).toString.call(value) === "[object Object]";
}

// file_list and folder_content constructors
// folder_content is folder["content"]
function ReadRawFileList(raw_file_list)
{
    if (!isList(raw_file_list))
    {
        console.warn("[!] list.json raw file list is not a list");
        return null;
    }
        
    var file_dict = {};
    for (var file_info of raw_file_list)
    {
        if (!IsFileInfo(file_info))
        {
            console.warn("[!] corrupted file_info " + file_info);
            continue;
        }
            
        var file_id = FileId(file_info);
        if (file_dict.hasOwnProperty(file_id))
        {
            console.warn("[!] file_id already exists " + file_id);
            continue;
        }
            

        file_dict[file_id] = file_info;
    }
    
    return file_dict;
}

C_DRIVE_SLASH = "C:/";
ROOT_FOLDER_ID = "<root>";

function ReadRawFolderContent(raw_folder_content, curr_abs_path=C_DRIVE_SLASH, _all_folder_id=null)
{
    if (!isList(raw_folder_content))
    {
        console.warn("[!] list.json raw folder content is not a list");
        return null;
    }
        

    var all_folder_id = (_all_folder_id != null) ? _all_folder_id : new Set();
    // create a temporary set if no "all folder id" was passed in,
    if (curr_abs_path == C_DRIVE_SLASH)
    {
        all_folder_id.add(ROOT_FOLDER_ID);
    }

    var folder_dict = {}; // return value
    for (var item of raw_folder_content) // list
    {
        if (IsFilePointer(item)) // run into a file pointer
        {
            var point_to_id = PointerTarget(item);
            if (folder_dict.hasOwnProperty(point_to_id))
            {
                consle.warn("[!] " + curr_abs_path + " has two files that have the same ID " + point_to_id);
            }   
            else
            {
                folder_dict[point_to_id] = item;
            }   
        }
        else if (IsFolderInfo(item)) // run into a folder
        {
            var folder_id = FolderId(item);
            if (folder_dict.hasOwnProperty(folder_id))
            {
                consle.warn("[!] " + curr_abs_path + " has two folders that have the same ID " + folder_id);
            } 
            else if (all_folder_id.has(folder_id))
            {
                consle.warn("[!] this folder ID already exists somewhere else " + folder_id);
            }
            else
            {
                // add this folder id to "all folder id" record
                all_folder_id.add(folder_id);
                
                // add path hint to current folder info
                SetFolderPathHint(item, curr_abs_path);

                // recursively reassign folder content, adding path hint
                // [Fa, Fb, Fc] --> {"Fa": Fa, "Fb": Fb, ...}
                new_abs_path = curr_abs_path + folder_id + "/";
                rawfc = FolderContent(item);
                ReassignFolderContent(item, ReadRawFolderContent(rawfc, new_abs_path, all_folder_id));

                folder_dict[folder_id] = item;
            }
        }
        else
        {
            console.warn("[!] corrupted folder_info " + folder_info);
        }
            
    }
    return folder_dict;
}

function ReadRawListJson(str_content)
{
    var json_content = JSON.parse(str_content);

    if (!json_content.hasOwnProperty("files") || !json_content.hasOwnProperty("folders"))
    {
        return [null, null];
    }
        

    var files = json_content["files"];
    var folders = json_content["folders"];

    if (!isList(files) || !isList(folders))
    {
        return [null, null];
    }
    
    return [files, folders];

}


// file_info folder_info file_pointer constructors
function ConstructFileInfo(file_id, file_name="", file_json="")
{
    return {"id": file_id, "fileName": file_name, "fileJson": file_json};
}
    

function ConstructFolderInfo(folder_id, folder_name="", path_hint="", _content=null)
{
    var content = _content;
    if (content == null)
    {
        content = {};
    }
        
    return {
        "type": "folder",
        "id": folder_id, "folderName": folder_name, "content": content,
        "pathHint": path_hint
    };
}
    

function ConstructFolderContent(folders_and_pointers)
{
    var content_dict = {};
    for (var item of folders_and_pointers)
    {
        var item_id = FolderItemId(item);
        content_dict[item_id] = item;
    }
    
    return content_dict;
}
    

// type detection
function IsFileInfo(file_info)
{
    // if not file_info:
    if (file_info == null || Object.keys(file_info).length == 0)
    {
        return false;
    }
    if (!isDict(file_info))
    {
        return false;
    }
    
    return file_info.hasOwnProperty("id") && file_info.hasOwnProperty("fileName") && file_info.hasOwnProperty("fileJson");
}
    

function IsFolderInfo(folder_info)
{
    // if not folder_info:
    if (folder_info == null || Object.keys(folder_info).length == 0)
    {
        return false;
    }
    if (!isDict(folder_info))
    {
        return false;
    }
        
    if (!folder_info.hasOwnProperty("type"))
    {
        return false;
    }
        
    if (folder_info["type"] != "folder")
    {
        return false;
    }
    
    return folder_info.hasOwnProperty("id") && folder_info.hasOwnProperty("folderName");
}

function IsFilePointer(file_pointer)
{
    //if not file_pointer:
    if (file_pointer == null || Object.keys(file_pointer).length == 0)
    {
        return false;
    }
    if (!isDict(file_pointer))
    {
        return false;
    }
        
    if (!file_pointer.hasOwnProperty("type"))
    {
        return false;
    }
    
    if (file_pointer["type"] != "filePointer")
    {
        return false;
    }
    
    return file_pointer.hasOwnProperty("id");
}

// file_info selectors
function FileName(file_info)
{
    return file_info["fileName"];
}

function SetFileName(file_info, value)
{
    file_info["fileName"] = value;
}
    

function FileId(file_info)
{
    return file_info["id"];
}


function FileJson(file_info)
{
    return file_info["fileJson"];
}

function SetFileJson(file_info, value)
{
    file_info["fileJson"] = value;
}

// folder_info selectors
function FolderName(folder_info)
{
    return folder_info["folderName"];
}
    

function SetFolderName(folder_info, value)
{
    folder_info["folderName"] = value;
}
    

function FolderId(folder_info)
{
    return folder_info["id"];
}
    



function FileListKeys(file_list)
{
    return Object.keys(file_list);
}
    


function FolderContent(folder_info, correct_type=false)
{
    if (!IsFolderInfo(folder_info))
    {
        throw ("Selecting folder content: not a folder info");
    }
        

    if (!folder_info.hasOwnProperty("content"))
    {
        if (FolderId(folder_info) == ROOT_FOLDER_ID)
        {
            throw ("Invalid root folder info");
        }
            
        // add "content" key
        folder_info["content"] = {};
    }

    if (correct_type)
    {
        if (folder_info["content"] == null)
        {
            if (FolderId(folder_info) == ROOT_FOLDER_ID)
            {
                throw ("Cannot use correct type with root folder");
            }
                
            folder_info["content"] = {};
        }
    }
    
    return folder_info["content"];
}

function ReassignFolderContent(folder_info, value)
{
    folder_info["content"] = value;
}

function FolderPathHint(folder_info)
{
    if (!folder_info.hasOwnProperty("pathHint"))
    {
        return "";
    }
        
    return folder_info["pathHint"];
}

function SetFolderPathHint(folder_info, value)
{
    folder_info["pathHint"] = value;
}
    

// file_pointer selectors
function PointerTarget(file_pointer)
{
    return file_pointer["id"];
}
    

function SetPointerTarget(file_pointer, value)
{
    file_pointer["id"] = value;
}
    

// general folder content selectors
function FolderItemId(folder_or_pointer)
{
    return folder_or_pointer["id"];
}

// file_list selectors
function FileExistsById(file_info, file_list)
{
    return FindFile(file_info, file_list) != null;
}
    


function FindFile(file_info, file_list)
{
    var file_id = "";
    if (IsFileInfo(file_info))
    {
        file_id = FileId(file_info);
    }
        
    else if (IsFilePointer(file_info))
    {
        file_id = PointerTarget(file_info);
    }
    
    return file_list[file_id];
}
    

// folder_content selectors
function FindItemCurrDir(folder_or_pointer, folder_content)
{
    // if not folder_content
    if (folder_content == null || Object.keys(folder_content).length == 0)
    {
        // None, {}, []
        
        console.warn("empty folder! " + folder_content);
        return null;
    }
    
    console.log("folder_content to look at: " + Object.keys(folder_content));
    console.log("find what? " + FolderItemId(folder_or_pointer));

    return folder_content[FolderItemId(folder_or_pointer)];
}

function FindFolderRecursive(folder_info, folder_content)
{
    // if not folder_content:
    if (folder_content == null || Object.keys(folder_content).length == 0)
    {
        // empty folder_content
        // None, {}, []
        return null;
    }

    var folder_info_reference = FindItemCurrDir(folder_info, folder_content);
    if (folder_info_reference != null)
    {
        // found in curr dir
        return folder_info_reference;
    }
        

    for (var folder_key in folder_content)
    {
        var selected_folder = folder_content[folder_key];
        if (!IsFolderInfo(selected_folder))
        {
            continue;
        }
            

        var reference = FindFolderRecursive(folder_info, FolderContent(selected_folder))
        if (reference != null)
        {
            return reference;
        }
            
    }
    
    return null;
}

function SepPathHint(path_hint)
{
    // path_seq = [folder_id for folder_id in path_hint.split("/") if folder_id.strip()]
    var path_seq = path_hint.split("/").filter(folder_id => folder_id.trim().length > 0);
    return path_seq;
}
    

function SepPathAndName(path, allow_root=false)
{
    var sep_path = SepPathHint(path);
    if (sep_path.length <= 1)
    {
        if (allow_root && sep_path[0] + "/" == C_DRIVE_SLASH)
        {
            return [null, ROOT_FOLDER_ID];
        }
        else
        {
            return [null, null];
        }
    }

    // parent = "/".join(sep_path[0:-1])
    // name = sep_path[-1]
    var parent = sep_path.slice(0, sep_path.length - 1).join("/");
    var name = sep_path[sep_path.length - 1];
    
    return [parent, name];
}

function FindFolderByHint(folder_info, root_folder_content, all_folder_id=null)
{
    // if not folder_info:
    if (folder_info == null || Object.keys(folder_info).length == 0)
    {
        return null;
    }
    // if not root_folder_content:
    if (root_folder_content == null || Object.keys(root_folder_content).length == 0)
    {
        return null;
    }

    var path_hint = FolderPathHint(folder_info);
    // if not path_hint or not path_hint.startswith(C_DRIVE_SLASH):
    if (path_hint == null || path_hint.length == 0 || !path_hint.startsWith(C_DRIVE_SLASH))
    {
        return null;
    }

    // split path, ignoring empty strings
    var path_seq = SepPathHint(path_hint);

    var current_path_content = root_folder_content;

    // for folder_id in path_seq[1:]:
    for (var folder_id of path_seq.slice(1))
    {
        console.log("now we are looking at " + folder_id);

        if (all_folder_id != null && !FolderExistsById(folder_info, all_folder_id))
        {
            // folder does not exist in our record
            console.warn("folder does not exist in our record");
            return null;
        }
            

        var folder = FindItemCurrDir(ConstructFolderInfo(folder_id), current_path_content);
        // if not folder:
        if (folder == null || Object.keys(folder).length == 0)
        {
            // folder does not exist in curr dir (problematic pathHint)
            console.warn("folder does not exist in curr dir (problematic pathHint)");
            return null;
        }
            

        // go into that folder
        current_path_content = FolderContent(folder);
    }
    
    // get real reference
    var result = FindItemCurrDir(folder_info, current_path_content);
    return result;
}

function FolderExistsById(folder_info, all_folder_id)
{
    // return FolderId(folder_info) in all_folder_id
    return all_folder_id.has(FolderId(folder_info));
}
    

function FindFolderByPath(path, root_folder_content, all_folder_id=null)
{
    var path_seq = SepPathHint(path);
    if (path_seq.length == 0)
    {
        return null;
    }
      
    if (path == C_DRIVE_SLASH || path + "/" == C_DRIVE_SLASH)
    {
        // return ConstructFolderInfo(ROOT_FOLDER_ID, _content=root_folder_content)
        return ConstructFolderInfo(ROOT_FOLDER_ID, "", "", root_folder_content);
    }
        

    var folder_id = path_seq[path_seq.length - 1];
    // parent_folder = "/".join(path_seq[0:-1]) + "/"
    var parent_folder = path_seq.slice(0, path_seq.length - 1).join("/") + "/";

    // temp_folder_info = ConstructFolderInfo(folder_id, path_hint=parent_folder)
    var temp_folder_info = ConstructFolderInfo(folder_id, "", parent_folder, null);
    
    console.log("to look at: " + folder_id + "\n" +
                "parent folder: " + parent_folder);
    console.log(temp_folder_info);

    return FindFolderByHint(temp_folder_info, root_folder_content, all_folder_id);
}

function SelectItemInContent(folder_content, item_id)
{
    // return folder_content.get(item_id, None)
    return folder_content[item_id];
}
    

function ReassignItemInContent(folder_content, item_id, value)
{
    folder_content[item_id] = value;
}
    

function DeleteItemInContent(folder_content, item_id)
{
    // folder_content.pop(item_id)
    delete folder_content[item_id];
}
