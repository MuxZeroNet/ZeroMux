#!/usr/bin/env python2
# coding: utf-8

import json
import random


def GenerateNewId(dataType):
    if dataType not in ("file", "folder"):
        raise Exception("GenerateNewId: invalid dataType")

    charmap = "0123456789" + "abcdefghijk" + "mnopqrstuvwxyz" + \
              "ABCDEFGH" + "JKLMN" + "PQRSTUVWXY"

    prefix = "1" if dataType == "file" else "2"
    rest = "".join( \
        [charmap[random.SystemRandom().randint(0, len(charmap)-1)] \
        for _ in range(7)] )

    return prefix + rest

def GenerateNewUniqueId(dataType, existing):
    new_id = GenerateNewId(dataType)
    while(new_id in existing):
        new_id = GenerateNewId(dataType)

    return new_id


# file_list and folder_content constructors
# folder_content is folder["content"]
def ReadRawFileList(raw_file_list):
    if type(raw_file_list) != list:
        print "[!] list.json raw file list is not a list"
        return None

    file_dict = {}
    for file_info in raw_file_list:
        if not IsFileInfo(file_info):
            print "[!] corrupted file_info", file_info
            continue

        file_id = FileId(file_info)
        if file_dict.has_key(file_id):
            print "[!] file_id already exists", file_id
            continue

        file_dict[file_id] = file_info

    return file_dict

C_DRIVE_SLASH = "C:/"
ROOT_FOLDER_ID = "<root>"

def ReadRawFolderContent(raw_folder_content, curr_abs_path=C_DRIVE_SLASH, _all_folder_id=None):
    if type(raw_folder_content) != list:
        print "[!] list.json raw folder content is not a list"
        return None

    all_folder_id = _all_folder_id if _all_folder_id != None else set()
    # create a temporary set if no "all folder id" was passed in,
    if curr_abs_path == C_DRIVE_SLASH:
        all_folder_id.add(ROOT_FOLDER_ID)

    folder_dict = {} # return value
    for item in raw_folder_content: # list
        if IsFilePointer(item): # run into a file pointer
            point_to_id = PointerTarget(item)
            if folder_dict.has_key(point_to_id):
                print "[!] %s has two files that have the same ID %s" % (curr_abs_path, point_to_id)
            else:
                folder_dict[point_to_id] = item

        elif IsFolderInfo(item): # run into a folder
            folder_id = FolderId(item)
            if folder_dict.has_key(folder_id):
                print "[!] %s has two folders that have the same ID %s" % (curr_abs_path, folder_id)
            elif folder_id in all_folder_id:
                print "[!] this folder ID %s already exists somewhere else" % folder_id
            else:
                # add this folder id to "all folder id" record
                all_folder_id.add(folder_id)
                # add path hint to current folder info
                SetFolderPathHint(item, curr_abs_path)

                # recursively reassign folder content, adding path hint
                # [Fa, Fb, Fc] --> {"Fa": Fa, "Fb": Fb, ...}
                new_abs_path = curr_abs_path + folder_id + "/"
                rawfc = FolderContent(item)
                ReassignFolderContent(item, ReadRawFolderContent(rawfc, new_abs_path, all_folder_id))

                folder_dict[folder_id] = item
        else:
            print "[!] corrupted folder_info", folder_info

    return folder_dict


def ReadRawListJson(str_content):
    json_content = None
    json_content = json.loads(str_content)

    if not json_content.has_key("files") or not json_content.has_key("folders"):
        return None, None

    files = json_content["files"]
    folders = json_content["folders"]

    if type(files) != list or type(folders) != list:
        return None, None

    return files, folders

# raw_file_list raw_folder_content (list.json) constructor
def MakeListJson(file_list, root_folder_content):
    raw_file_list = ConvertFileList(file_list)
    raw_folder_content = ConvertFolderContent(root_folder_content)

    to_write = {"files": raw_file_list, "folders": raw_folder_content}
    return to_write

def ConvertFileList(file_list):
    raw_file_list = []
    for key in file_list:
        file_info = file_list[key]
        # only preserve keys that are useful
        file_id = FileId(file_info)
        file_name = FileName(file_info)
        file_json = FileJson(file_info)

        raw_file_list.append(ConstructFileInfo(file_id, file_name, file_json))

    return raw_file_list

def ConvertFolderContent(folder_content):
    if folder_content == None or len(folder_content) == 0:
        return []

    content_list = []

    for key in folder_content:
        item = folder_content[key]

        if IsFilePointer(item):
            content_list.append(item)

        elif IsFolderInfo(item):
            # remove useless keys
            folder_info = CopyWithoutUselessKeys(item)
            # change content recursively
            fcref = FolderContent(folder_info)
            ReassignFolderContent(folder_info, ConvertFolderContent(fcref))
            # add to content list
            content_list.append(folder_info)

    return content_list

# file_info folder_info file_pointer constructors
def ConstructFileInfo(file_id, file_name="", file_json=""):
    return {"id": file_id, "fileName": file_name, "fileJson": file_json}

def ConstructFolderInfo(folder_id, folder_name="", path_hint="", _content=None):
    content = _content
    if content == None:
        content = {}

    return {
        "type": "folder",
        "id": folder_id, "folderName": folder_name, "content": content,
        "pathHint": path_hint,
    }

def ConstructFolderContent(folders_and_pointers):
    content_dict = {}
    for item in folders_and_pointers:
        item_id = FolderItemId(item)
        content_dict[item_id] = item

    return content_dict

def CopyWithoutUselessKeys(folder_info):
    copied = {}
    for key in folder_info:
        if key != "pathHint":
            copied[key] = folder_info[key]
    return copied


def ConstructFilePointer(point_to_id):
    return {"type": "filePointer", "id": point_to_id}

# type detection
def IsFileInfo(file_info):
    if not file_info:
        return False
    if not type(file_info) == dict:
        return False
    return file_info.has_key("id") and file_info.has_key("fileName") and file_info.has_key("fileJson")

def IsFolderInfo(folder_info):
    if not folder_info:
        return False
    if not type(folder_info) == dict:
        return False
    if not folder_info.has_key("type"):
        return False
    if folder_info["type"] != "folder":
        return False

    return folder_info.has_key("id") and folder_info.has_key("folderName")

def IsFilePointer(file_pointer):
    if not file_pointer:
        return False
    if not type(file_pointer) == dict:
        return False
    if not file_pointer.has_key("type"):
        return False
    if file_pointer["type"] != "filePointer":
        return False

    return file_pointer.has_key("id")

# file_info selectors
def FileName(file_info):
    return file_info["fileName"]

def SetFileName(file_info, value):
    file_info["fileName"] = value

def FileId(file_info):
    return file_info["id"]

# def SetFileId(file_info, value):
#     file_info["id"] = value

def FileJson(file_info):
    return file_info["fileJson"]

def SetFileJson(file_info, value):
    file_info["fileJson"] = value

# folder_info selectors
def FolderName(folder_info):
    return folder_info["folderName"]

def SetFolderName(folder_info, value):
    folder_info["folderName"] = value

def FolderId(folder_info):
    return folder_info["id"]

# def SetFolderId(folder_info, value):
#     folder_info["id"] = value

def FileListKeys(file_list):
    return file_list.keys()


def FolderContent(folder_info, correct_type=False):
    if not IsFolderInfo(folder_info):
        raise Exception("Selecting folder content: not a folder info")

    if not folder_info.has_key("content"):
        if FolderId(folder_info) == ROOT_FOLDER_ID:
            raise Exception("Invalid root folder info")
        # add "content" key
        folder_info["content"] = {}

    if correct_type:
        if folder_info["content"] == None:
            if FolderId(folder_info) == ROOT_FOLDER_ID:
                raise Exception("Cannot use correct type with root folder")
            folder_info["content"] = {}

    return folder_info["content"]

def ReassignFolderContent(folder_info, value):
    folder_info["content"] = value

def FolderPathHint(folder_info):
    if not folder_info.has_key("pathHint"):
        return ""
    return folder_info["pathHint"]

def SetFolderPathHint(folder_info, value):
    folder_info["pathHint"] = value

# file_pointer selectors
def PointerTarget(file_pointer):
    return file_pointer["id"]

def SetPointerTarget(file_pointer, value):
    file_pointer["id"] = value

# general folder content selectors
def FolderItemId(folder_or_pointer):
    return folder_or_pointer["id"]

# file_list selectors
def FileExistsById(file_info, file_list):
    return FindFile(file_info, file_list) != None


def FindFile(file_info, file_list):
    file_id = ""
    if IsFileInfo(file_info):
        file_id = FileId(file_info)
    elif IsFilePointer(file_info):
        file_id = PointerTarget(file_info)

    return file_list.get(file_id)

# folder_content selectors
def FindItemCurrDir(folder_or_pointer, folder_content):
    if not folder_content:
        # None, {}, []
        print "empty folder!", folder_content
        return None
    print "folder_content to look at", folder_content.keys()
    print "find what?", FolderItemId(folder_or_pointer)

    return folder_content.get(FolderItemId(folder_or_pointer))

def FindFolderRecursive(folder_info, folder_content):
    if not folder_content:
        # empty folder_content
        # None, {}, []
        return None

    folder_info_reference = FindItemCurrDir(folder_info, folder_content)
    if  folder_info_reference != None:
        # found in curr dir
        return folder_info_reference

    for folder_key in folder_content:
        selected_folder = folder_content[folder_key]
        if not IsFolderInfo(selected_folder):
            continue

        reference = FindFolderRecursive(folder_info, FolderContent(selected_folder))
        if reference != None:
            return reference

    return None

def SepPathHint(path_hint):
    path_seq = [folder_id for folder_id in path_hint.split("/") if folder_id.strip()]
    return path_seq

def SepPathAndName(path, allow_root=False):
    sep_path = SepPathHint(path)
    if len(sep_path) <= 1:
        if allow_root and sep_path[0] + "/" == C_DRIVE_SLASH:
            return (None, ROOT_FOLDER_ID)
        else:
            return (None, None)

    parent = "/".join(sep_path[0:-1])
    name = sep_path[-1]
    return (parent, name)

def FindFolderByHint(folder_info, root_folder_content, all_folder_id=None):
    if not folder_info:
        return None
    if not root_folder_content:
        return None

    path_hint = FolderPathHint(folder_info)
    if not path_hint or not path_hint.startswith(C_DRIVE_SLASH):
        return None

    # split path, ignoring empty strings
    path_seq = SepPathHint(path_hint)

    current_path_content = root_folder_content

    for folder_id in path_seq[1:]:
        print "now we are looking at ", folder_id

        if all_folder_id != None and not FolderExistsById(folder_info, all_folder_id):
            # folder does not exist in our record
            print "folder does not exist in our record"
            return None

        folder = FindItemCurrDir(ConstructFolderInfo(folder_id), current_path_content)
        if not folder:
            # folder does not exist in curr dir (problematic pathHint)
            print "folder does not exist in curr dir (problematic pathHint)"
            return None

        # go into that folder
        current_path_content = FolderContent(folder)

    # get real reference
    result = FindItemCurrDir(folder_info, current_path_content)
    return result


def FolderExistsById(folder_info, all_folder_id):
    return FolderId(folder_info) in all_folder_id

def FindFolderByPath(path, root_folder_content, all_folder_id=None):
    path_seq = SepPathHint(path)
    if len(path_seq) == 0:
        return None
    if path == C_DRIVE_SLASH or path + "/" == C_DRIVE_SLASH:
        return ConstructFolderInfo(ROOT_FOLDER_ID, _content=root_folder_content)

    folder_id = path_seq[-1]
    parent_folder = "/".join(path_seq[0:-1]) + "/"

    temp_folder_info = ConstructFolderInfo(folder_id, path_hint=parent_folder)
    print "to look at:", folder_id,
    print "parent folder:", parent_folder,
    print "temp folder info:", temp_folder_info

    return FindFolderByHint(temp_folder_info, root_folder_content, all_folder_id)

def FolderForEach(folder_content, fn):
    if not folder_content:
        # empty folder_content - None, {}, []
        return

    for folder_key in folder_content:
        selected_item = folder_content[folder_key]
        fn(selected_item)
        if IsFolderInfo(selected_item):
            FolderForEach(FolderContent(selected_item), fn)

def FindAllFilePointersIn(folder_content):
    pointers = []
    folder_ids = set()
    def find_pointer(item):
        if IsFilePointer(item):
            pointers.append(item)
        elif IsFolderInfo(item):
            folder_ids.add(FolderId(item))

    FolderForEach(folder_content, find_pointer)

    return pointers, list(folder_ids)



def SelectItemInContent(folder_content, item_id):
    return folder_content.get(item_id, None)

def ReassignItemInContent(folder_content, item_id, value):
    folder_content[item_id] = value

def DeleteItemInContent(folder_content, item_id):
    folder_content.pop(item_id)

def DeleteFileFromList(file_list, file_id):
    file_list.pop(file_id)

def DeleteFolderFromList(all_folder_id, folder_id):
    all_folder_id.remove(folder_id)
